const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const Zip=require('adm-zip');
const {ModManager,validateRegistry,resolveDependencies,loadRegistry,unpack,architecture}=require('../electron/mods.cjs');
const registry=()=>({schemaVersion:1,mods:[
  {id:'bepinex',name:'Loader',version:'1',description:'Loader',dependencies:[],downloads:{any:{url:'https://example.org/loader.zip',format:'zip',extract:['BepInEx/','winhttp.dll']}}},
  {id:'reactor',name:'Reactor',version:'1',description:'Library',dependencies:['bepinex'],downloads:{any:{url:'https://example.org/Reactor.dll',format:'dll',fileName:'Reactor.dll'}}},
  {id:'atr',name:'ATR',version:'1',description:'Roles',dependencies:['reactor'],downloads:{any:{url:'https://example.org/ATR.dll',format:'dll',fileName:'ATR.dll'}}}
]});
function pe(arch=0x14c){const bytes=Buffer.alloc(128);bytes.write('MZ');bytes.writeUInt32LE(80,60);bytes.writeUInt32LE(0x4550,80);bytes.writeUInt16LE(arch,84);return bytes;}
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-mods-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const game=path.join(root,'game');await fs.mkdir(game);await fs.writeFile(path.join(game,'Among Us.exe'),pe());return {root,game};}
function loader(){const zip=new Zip();zip.addFile('BepInEx/core/Loader.dll',pe());zip.addFile('winhttp.dll',pe());return zip.toBuffer();}
test('registry resolves transitive dependencies once and rejects missing/cyclic entries',()=>{
  const data=validateRegistry(registry());assert.deepEqual(resolveDependencies(data,'atr').map(x=>x.id),['bepinex','reactor','atr']);
  data.mods[0].versions[0].dependencies=[{id:'atr'}];assert.throws(()=>validateRegistry(data),/Zyklische/);
  const missing=registry();missing.mods[2].dependencies=['unknown'];assert.throws(()=>validateRegistry(missing),/Fehlende/);
  const unsafe=registry();unsafe.mods[1].downloads.any.fileName='../escape.dll';assert.throws(()=>validateRegistry(unsafe));
});
test('development never fetches remote mods.json; production uses GitHub',async t=>{
  const {root}=await fixture(t);const file=path.join(root,'mods.json');await fs.writeFile(file,JSON.stringify(registry()));let calls=0;
  const fetcher=async()=>{calls++;return new Response(JSON.stringify(registry()));};
  const options={localFile:file,modsUrl:'https://raw.githubusercontent.com/owner/repo/main/mods.json',fetcher};
  const dev=await loadRegistry({...options,development:true});assert.equal(calls,0);assert.match(dev.source,/Dev/);
  const prod=await loadRegistry({...options,development:false});assert.equal(calls,1);assert.match(prod.source,/GitHub/);
  await assert.rejects(loadRegistry({...options,development:false,fetcher:async()=>new Response('invalid json')}));
});
test('zip extraction rejects traversal, protected game files and bad hashes',()=>{
  const zip=new Zip();zip.addFile('Among Us.exe',pe());
  assert.throws(()=>unpack({format:'zip',extract:['Among Us.exe']},zip.toBuffer()),/Nicht erlaubte/);
  assert.throws(()=>unpack({format:'dll',fileName:'ATR.dll',sha256:'0'.repeat(64)},pe()),/Prüfsumme/);
  assert.throws(()=>unpack({format:'zip',extract:['BepInEx/plugins/Missing.dll']},loader()),/fehlt/);
});
test('detects actual game architecture and installs full dependency chain',async t=>{
  const {root,game}=await fixture(t);assert.equal(await architecture(game),'x86');
  await fs.writeFile(path.join(game,'Among Us.exe'),pe(0x8664));assert.equal(await architecture(game),'x64');
  const localFile=path.join(root,'mods.json');await fs.writeFile(localFile,JSON.stringify(registry()));
  const fetched=[];const manager=new ModManager({localFile,development:true,dataDirectory:path.join(root,'data'),fetcher:async url=>{fetched.push(url);return new Response(url.endsWith('.zip')?loader():pe());}});
  await manager.load();const profile={id:'profile',directory:game};const plan=await manager.plan(profile,'atr');
  assert.deepEqual(plan.mods.map(x=>x.id),['bepinex','reactor','atr']);
  const result=await manager.install(profile,plan.id);assert.equal(fetched.length,3);assert.match(result.message,/atr/);
  assert.equal((await manager.status(profile)).installed.every(x=>x.intact),true);
  await fs.writeFile(path.join(game,'BepInEx/plugins/ATR.dll'),'modified');assert.equal((await manager.status(profile)).installed.find(x=>x.id==='atr').intact,false);
  await assert.rejects(manager.install(profile,plan.id),/abgelaufen/);
});
test('failed dependency download leaves profile unchanged',async t=>{
  const {root,game}=await fixture(t);const localFile=path.join(root,'mods.json');await fs.writeFile(localFile,JSON.stringify(registry()));
  const manager=new ModManager({localFile,development:true,dataDirectory:path.join(root,'data'),fetcher:async url=>new Response(url.endsWith('.zip')?loader():'error',{status:url.endsWith('.zip')?200:503})});
  await manager.load();const profile={id:'p',directory:game};const plan=await manager.plan(profile,'atr');await assert.rejects(manager.install(profile,plan.id),/HTTP 503/);
  assert.deepEqual(await fs.readdir(game),['Among Us.exe']);
});
test('junction targets are rejected before files are written',async t=>{
  const {root,game}=await fixture(t);const external=path.join(root,'external');await fs.mkdir(external);await fs.symlink(external,path.join(game,'BepInEx'),'junction');
  const localFile=path.join(root,'mods.json');await fs.writeFile(localFile,JSON.stringify(registry()));const manager=new ModManager({localFile,development:true,dataDirectory:path.join(root,'data'),fetcher:async()=>new Response(loader())});
  await manager.load();const profile={id:'p',directory:game};const plan=await manager.plan(profile,'bepinex');await assert.rejects(manager.install(profile,plan.id),/Verknüpfung/);assert.deepEqual(await fs.readdir(external),[]);
});
test('selects exact mod and dependency versions, rejects conflicts',()=>{
  const data=validateRegistry(registry());
  data.mods[1].versions.push({...data.mods[1].versions[0],version:'2'});
  data.mods[2].versions.push({...data.mods[2].versions[0],version:'2',dependencies:[{id:'reactor',version:'2'}]});
  validateRegistry(data);
  assert.deepEqual(resolveDependencies(data,'atr','2').map(mod=>[mod.id,mod.version]),[['bepinex','1'],['reactor','2'],['atr','2']]);
  assert.deepEqual(resolveDependencies(data,'atr','1').map(mod=>[mod.id,mod.version]),[['bepinex','1'],['reactor','1'],['atr','1']]);
  assert.throws(()=>resolveDependencies(data,'atr','missing'),/nicht gefunden/);
  data.mods[2].versions[1].dependencies.push({id:'reactor',version:'1'});
  assert.throws(()=>validateRegistry(data),/Versionskonflikt/);
});
test('write failure restores overwritten files and removes newly installed files',async t=>{
  const {root,game}=await fixture(t);await fs.mkdir(path.join(game,'BepInEx/plugins'),{recursive:true});
  await fs.writeFile(path.join(game,'BepInEx/plugins/Reactor.dll'),'old reactor');
  const localFile=path.join(root,'mods.json');await fs.writeFile(localFile,JSON.stringify(registry()));
  const manager=new ModManager({localFile,development:true,dataDirectory:path.join(root,'data'),fetcher:async url=>new Response(url.endsWith('.zip')?loader():pe())});await manager.load();
  const profile={id:'p',directory:game};const plan=await manager.plan(profile,'atr');
  const original=fs.writeFile;
  t.mock.method(fs,'writeFile',async(target,...args)=>{if(target===path.join(game,'BepInEx/plugins/ATR.dll'))throw new Error('Simulierter Schreibfehler');return original(target,...args);});
  await assert.rejects(manager.install(profile,plan.id),/zurückgesetzt/);
  assert.equal(await fs.readFile(path.join(game,'BepInEx/plugins/Reactor.dll'),'utf8'),'old reactor');
  await assert.rejects(fs.access(path.join(game,'winhttp.dll')));
});
test('version switch removes obsolete owned DLLs but refuses modified obsolete files',async t=>{
  const {root,game}=await fixture(t);const data=validateRegistry(registry());
  data.mods[2].versions.push({...data.mods[2].versions[0],version:'2',downloads:{any:{url:'https://example.org/NewATR.dll',format:'dll',fileName:'NewATR.dll'}}});
  const localFile=path.join(root,'mods.json');await fs.writeFile(localFile,JSON.stringify(data));const manager=new ModManager({localFile,development:true,dataDirectory:path.join(root,'data'),fetcher:async url=>new Response(url.endsWith('.zip')?loader():pe())});await manager.load();
  const profile={id:'p',directory:game};let plan=await manager.plan(profile,'atr','1');await manager.install(profile,plan.id);
  const old=path.join(game,'BepInEx/plugins/ATR.dll');await fs.writeFile(old,'user changed');
  plan=await manager.plan(profile,'atr','2');await assert.rejects(manager.install(profile,plan.id),/verändert/);
  assert.equal(await fs.readFile(old,'utf8'),'user changed');await fs.writeFile(old,pe());
  plan=await manager.plan(profile,'atr','2');const result=await manager.install(profile,plan.id);
  await assert.rejects(fs.access(old));await fs.access(path.join(game,'BepInEx/plugins/NewATR.dll'));await fs.access(path.join(result.backup,'BepInEx/plugins/ATR.dll'));
  assert.equal((await manager.status(profile)).installed.find(mod=>mod.id==='atr').version,'2');
});
test('bundled ATR versions pin the dependency versions present in their official packages',()=>{
  const data=validateRegistry(require('../mods.json'));
  assert.equal(resolveDependencies(data,'atr','0.14.0').find(mod=>mod.id==='reactor').version,'2.5.0');
  assert.equal(resolveDependencies(data,'atr','0.14.1').find(mod=>mod.id==='reactor').version,'2.5.1');
});
test('an unprepared profile returns a setup status without failing the catalog',async t=>{
  const {root}=await fixture(t);const manager=new ModManager({dataDirectory:path.join(root,'data')});
  const status=await manager.status({id:'new',directory:path.join(root,'empty-profile')});
  assert.equal(status.ready,false);assert.equal(status.architecture,null);assert.deepEqual(status.installed,[]);assert.match(status.message,/Originaldateien/);
});
test('archiveRoot extracts version-wrapped mod packs into the game root',()=>{
  const zip=new Zip();zip.addFile('Las Monjas 4.0.1/BepInEx/plugins/LasMonjas.dll',pe());zip.addFile('Las Monjas 4.0.1/winhttp.dll',pe());zip.addFile('OtherFolder/BepInEx/plugins/Ignore.dll',pe());
  const files=unpack({format:'zip',archiveRoot:'Las Monjas 4.0.1/',extract:['BepInEx/','winhttp.dll']},zip.toBuffer());
  assert.deepEqual(files.map(file=>file.name),['BepInEx/plugins/LasMonjas.dll','winhttp.dll']);
  const invalid=registry();invalid.mods[0].downloads.any.archiveRoot='../escape/';assert.throws(()=>validateRegistry(invalid),/Unsicherer/);
});
test('Las Monjas uses the complete verified official x64 bundle for Among Us 19',()=>{
  const data=validateRegistry(require('../mods.json'));const mods=resolveDependencies(data,'lasmonjas','4.0.1');
  assert.equal(mods.length,1);assert.equal(mods[0].gameVersion,'19.0.0 (2026.9.29)');
  const download=mods[0].downloads.x64;
  assert.equal(mods[0].downloads.x86,undefined);
  assert.equal(download.archiveRoot,'Las Monjas 4.0.1/');
  assert.ok(download.extract.includes('BepInEx/')&&download.extract.includes('dotnet/'));
  assert.match(download.sha256,/^[a-f0-9]{64}$/);
});
