const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash,randomUUID} = require('node:crypto');
const Zip = require('adm-zip');
const {inspectGame} = require('./profiles.cjs');
const hash = data => createHash('sha256').update(data).digest('hex');
const MB=1024*1024;

function httpsUrl(value) {
  const url=new URL(value);
  if(url.protocol!=='https:' || url.username || url.password)throw new Error('Download-URLs müssen HTTPS verwenden.');
  return url.href;
}
function relativeFile(value) {
  if(typeof value!=='string'||!value||value.includes('\\')||value.startsWith('/')||value.length>240)throw new Error('Ungültiger Dateipfad im Mod-Paket.');
  const parts=value.replace(/\/$/,'').split('/');
  if(parts.some(p=>!p||p==='.'||p==='..'||/[<>:"|?*\x00-\x1f]/.test(p)||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p)))throw new Error('Unsicherer Dateipfad im Mod-Paket: '+value);
  return parts.join('/');
}
function validateRegistry(input) {
  if(input?.schemaVersion!==1 || !Array.isArray(input.mods)||input.mods.length>200)throw new Error('mods.json hat ein ungültiges Format (schemaVersion: 1 erforderlich).');
  // Accept the original flat form as a single-version shorthand.
  input={schemaVersion:1,mods:input.mods.map(mod=>({...mod,versions:mod?.versions || [{version:mod?.version,description:mod?.description,dependencies:mod?.dependencies,downloads:mod?.downloads}]}))};
  const ids=new Set();
  for(const mod of input.mods){
    if(!mod||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(mod.id)||ids.has(mod.id)||typeof mod.name!=='string'||!mod.name||mod.name.length>100||typeof mod.description!=='string'||mod.description.length>4000||!Array.isArray(mod.versions)||!mod.versions.length||mod.versions.length>100)throw new Error('Ungültiger Mod-Eintrag in mods.json.');
    ids.add(mod.id);
    const versions=new Set();
    for(const version of mod.versions){
      if(!version||typeof version.version!=='string'||!version.version||version.version.length>100||versions.has(version.version)||!Array.isArray(version.dependencies)||!version.downloads||!Object.keys(version.downloads).length)throw new Error('Ungültige Mod-Version für '+mod.id);
      if(version.description!==undefined && (typeof version.description!=='string'||version.description.length>4000))throw new Error('Ungültige Versionsbeschreibung.');
      if(version.gameVersion!==undefined && (typeof version.gameVersion!=='string'||version.gameVersion.length>100))throw new Error('Ungültige Spielversionsangabe.');
      versions.add(version.version);
      version.dependencies=version.dependencies.map(dependency=>typeof dependency==='string'?{id:dependency}:dependency);
      if(version.dependencies.some(dependency=>!dependency||typeof dependency.id!=='string'||(dependency.version!==undefined&&typeof dependency.version!=='string')))throw new Error('Ungültige Abhängigkeit für '+mod.id);
      for(const [arch,download] of Object.entries(version.downloads)){
      if(!['x86','x64','any'].includes(arch)||!download||!['dll','zip'].includes(download.format))throw new Error('Ungültiger Download für '+mod.id);
      httpsUrl(download.url);
      if(download.sha256 && !/^[a-f0-9]{64}$/i.test(download.sha256))throw new Error('Ungültige SHA256-Prüfsumme für '+mod.id);
      if(download.format==='dll' && (relativeFile(download.fileName).includes('/')||!download.fileName.toLowerCase().endsWith('.dll')))throw new Error('DLL-Dateiname fehlt für '+mod.id);
      if(download.format==='zip'){
        if(download.archiveRoot!==undefined){
          relativeFile(download.archiveRoot);
          if(!download.archiveRoot.endsWith('/'))throw new Error('archiveRoot muss mit / enden.');
        }
        if(!Array.isArray(download.extract)||!download.extract.length||download.extract.length>200)throw new Error('ZIP-Dateien benötigen eine extract-Liste.');
        download.extract.forEach(relativeFile);
      }
    }
    }
  }
  for(const mod of input.mods)for(const version of mod.versions)for(const dependency of version.dependencies){
    if(!ids.has(dependency.id))throw new Error(`Fehlende Abhängigkeit ${dependency.id} für ${mod.id}.`);
    if(dependency.version && !input.mods.find(mod=>mod.id===dependency.id).versions.some(version=>version.version===dependency.version))throw new Error(`Abhängigkeitsversion ${dependency.id} ${dependency.version} nicht gefunden.`);
  }
  for(const mod of input.mods)for(const version of mod.versions)resolveDependencies(input,mod.id,version.version);
  return input;
}
function resolveDependencies(registry,id,selectedVersion){
  const result=[],done=new Map(),active=new Set();
  function visit(key,requested){
    if(active.has(key))throw new Error('Zyklische Mod-Abhängigkeit: '+key);
    const mod=registry.mods.find(mod=>mod.id===key);
    if(!mod)throw new Error('Mod nicht gefunden: '+key);
    const version=mod.versions.find(version=>version.version===(requested||mod.versions[0].version));
    if(!version)throw new Error(`Mod-Version ${key} ${requested} nicht gefunden.`);
    if(done.has(key)){
      if(done.get(key)!==version.version)throw new Error(`Versionskonflikt für ${key}: ${done.get(key)} und ${version.version}.`);
      return;
    }
    active.add(key);version.dependencies.forEach(dependency=>visit(dependency.id,dependency.version));active.delete(key);done.set(key,version.version);result.push({...mod,...version});
  }
  visit(id,selectedVersion);return result;
}
async function architecture(directory){
  const file=await fs.open(path.join(directory,'Among Us.exe'),'r');
  try{
    const dos=Buffer.alloc(64);await file.read(dos,0,64,0);
    if(dos.toString('ascii',0,2)!=='MZ')throw new Error('Among Us.exe ist keine Windows-EXE.');
    const offset=dos.readUInt32LE(60);
    const header=Buffer.alloc(6);const result=await file.read(header,0,6,offset);
    if(result.bytesRead!==6||header.readUInt32LE(0)!==0x4550)throw new Error('Ungültiger PE-Header in Among Us.exe.');
    const machine=header.readUInt16LE(4);
    if(machine===0x14c)return 'x86';if(machine===0x8664)return 'x64';
    throw new Error('Diese Spielarchitektur wird nicht unterstützt.');
  }finally{await file.close();}
}
async function fetchBytes(url,limit=200*MB,fetcher=fetch){
  let current=httpsUrl(url);
  for(let i=0;i<6;i++){
    const response=await fetcher(current,{redirect:'manual',signal:AbortSignal.timeout(120000),headers:{'User-Agent':'Orbit-AmongUs-Manager'}});
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');await response.body?.cancel();
      if(!location)throw new Error('Download-Weiterleitung ohne Ziel.');
      current=httpsUrl(new URL(location,current).href);continue;
    }
    if(!response.ok)throw new Error(`Download fehlgeschlagen (HTTP ${response.status}): ${current}`);
    if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new Error('Download ist zu groß.');}
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw new Error('Download ist zu groß.');chunks.push(Buffer.from(chunk));}
    return Buffer.concat(chunks);
  }
  throw new Error('Zu viele Download-Weiterleitungen.');
}
async function loadRegistry({localFile,modsUrl,development,fetcher=fetch}){
  // Never fetch the registry in development, even when modsUrl is configured.
  if(development || !modsUrl)return {registry:validateRegistry(JSON.parse(await fs.readFile(localFile,'utf8'))),source:development?'Lokal · Dev-Modus':'Lokal · mitgelieferter Katalog'};
  const url=new URL(httpsUrl(modsUrl));
  if(!['raw.githubusercontent.com','github.com'].includes(url.hostname))throw new Error('modsUrl muss auf eine rohe mods.json auf GitHub zeigen.');
  const bytes=await fetchBytes(url.href,2*MB,fetcher);
  return {registry:validateRegistry(JSON.parse(bytes.toString('utf8'))),source:'GitHub · '+url.href};
}
function allowedTarget(name){
  const normalized=relativeFile(name);
  // Mod packages may change only loader/plugin files, never the game's binaries.
  if(!/^(BepInEx\/|dotnet\/|winhttp\.dll$|doorstop_config\.ini$|\.doorstop_version$)/i.test(normalized))throw new Error('Nicht erlaubte Mod-Zieldatei: '+name);
  return normalized;
}
function unpack(download,bytes){
  if(download.sha256 && hash(bytes)!==download.sha256.toLowerCase())throw new Error('Prüfsumme stimmt nicht mit mods.json überein.');
  if(download.format==='dll'){
    if(bytes.toString('ascii',0,2)!=='MZ')throw new Error('Der Download ist keine gültige DLL.');
    return [{name:allowedTarget('BepInEx/plugins/'+download.fileName),data:bytes}];
  }
  const zip=new Zip(bytes);const entries=zip.getEntries();
  if(entries.length>10000)throw new Error('ZIP enthält zu viele Dateien.');
  const files=[],seen=new Set();let size=0;
  for(const entry of entries){
    const rawName=relativeFile(entry.entryName);
    if((entry.header.attr>>>16 & 0xf000)===0xa000)throw new Error('ZIP enthält symbolische Verknüpfungen.');
    if(entry.isDirectory)continue;
    // Some official packs wrap their actual game-root files in a version folder.
    // Strip only the explicitly configured prefix, never arbitrary path parts.
    const prefix=download.archiveRoot||'';
    if(prefix&&!rawName.startsWith(prefix))continue;
    const name=relativeFile(rawName.slice(prefix.length));
    if(!download.extract.some(rule=>rule.endsWith('/')?name.startsWith(rule):name===rule))continue;
    allowedTarget(name);
    const key=name.toLowerCase();if(seen.has(key))throw new Error('ZIP enthält doppelte Zieldateien.');seen.add(key);
    size+=entry.header.size;if(size>512*MB||entry.header.size>128*MB)throw new Error('Entpacktes Mod-Paket ist zu groß.');
    const data=entry.getData();if(data.length!==entry.header.size)throw new Error('Beschädigte ZIP-Datei.');
    files.push({name,data});
  }
  for(const rule of download.extract)if(!rule.endsWith('/')&&!files.some(file=>file.name===rule))throw new Error('Datei fehlt im ZIP: '+rule);
  if(!files.length)throw new Error('Keine passenden Dateien im Mod-Paket.');
  return files;
}
async function safeDestination(root,name){
  const segments=relativeFile(name).split('/');let current=root;
  for(let i=0;i<segments.length;i++){
    current=path.join(current,segments[i]);
    try{
      const stat=await fs.lstat(current);
      if(stat.isSymbolicLink())throw new Error('Mod-Ziel enthält eine symbolische Verknüpfung: '+name);
      if(i<segments.length-1 && !stat.isDirectory())throw new Error('Ein Zielordner ist eine Datei: '+name);
      if(i===segments.length-1 && !stat.isFile())throw new Error('Eine Zieldatei ist ein Ordner: '+name);
    }catch(error){if(error.code!=='ENOENT')throw error;}
  }
  return current;
}
class ModManager {
  constructor(options){this.options=options;this.plans=new Map();this.catalog=null;}
  async load(){const loaded=await loadRegistry(this.options);this.catalog=loaded;this.plans.clear();return loaded;}
  statePath(directory){return path.join(this.options.dataDirectory,'mod-state',hash(directory.toLowerCase())+'.json');}
  async installed(directory){
    try{return JSON.parse(await fs.readFile(this.statePath(directory),'utf8'));}
    catch(error){if(error.code==='ENOENT')return [];throw new Error('Installationsstatus konnte nicht gelesen werden.');}
  }
  async status(profile){
    let directory;
    try{directory=await inspectGame(profile.directory);}
    catch(error){if(error.code==='GAME_NOT_FOUND')return {ready:false,architecture:null,installed:[],message:error.message};throw error;}
    const installed=await this.installed(directory);
    const checked=[];
    for(const item of installed){
      let intact=true;
      for(const file of item.files){try{const target=await safeDestination(directory,file.name);if(hash(await fs.readFile(target))!==file.sha256)intact=false;}catch{intact=false;}}
      checked.push({id:item.id,version:item.version,intact});
    }
    return {ready:true,architecture:await architecture(directory),installed:checked};
  }
  async plan(profile,modId,version){
    if(!this.catalog)await this.load();
    const directory=await inspectGame(profile.directory);const arch=await architecture(directory);
    const mods=resolveDependencies(this.catalog.registry,modId,version).map(mod=>{
      const download=mod.downloads[arch]||mod.downloads.any;
      if(!download)throw new Error(`${mod.name} ist für ${arch} nicht verfügbar.`);
      return {...mod,download};
    });
    const id=randomUUID();this.plans.clear();this.plans.set(id,{profileId:profile.id,directory,mods});
    return {id,architecture:arch,mods:mods.map(mod=>({id:mod.id,name:mod.name,version:mod.version,url:mod.download.url,verified:!!mod.download.sha256}))};
  }
  async install(profile,planId,progress=()=>{}){
    const plan=this.plans.get(planId);this.plans.delete(planId);
    if(!plan||plan.profileId!==profile.id||plan.directory!==await inspectGame(profile.directory))throw new Error('Installationsplan ist abgelaufen. Bitte erneut auswählen.');
    const downloadCache=new Map(),destinations=new Map(),records=[];let total=0;
    for(const mod of plan.mods){
      progress(`${mod.name} ${mod.version} herunterladen …`);
      let bytes=downloadCache.get(mod.download.url);
      if(!bytes){bytes=await fetchBytes(mod.download.url,200*MB,this.options.fetcher);downloadCache.set(mod.download.url,bytes);}
      const files=unpack(mod.download,bytes);
      const record={id:mod.id,version:mod.version,files:[]};
      for(const file of files){
        total+=file.data.length;if(total>768*MB)throw new Error('Die gesamte Installation ist zu groß.');
        const key=file.name.toLowerCase();
        if(destinations.has(key))throw new Error('Mehrere Mods schreiben dieselbe Datei: '+file.name);
        destinations.set(key,file);record.files.push({name:file.name,sha256:hash(file.data)});
      }
      records.push(record);
    }
    const previous=await this.installed(plan.directory);
    const next=previous.filter(item=>!records.some(record=>record.id===item.id)).concat(records);
    const owned=new Set(next.flatMap(item=>item.files.map(file=>file.name.toLowerCase())));
    const stale=[];
    for(const old of previous.filter(item=>records.some(record=>record.id===item.id))){
      for(const file of old.files){
        if(owned.has(file.name.toLowerCase()))continue;
        allowedTarget(file.name);
        const target=await safeDestination(plan.directory,file.name);
        let data;
        try{data=await fs.readFile(target);}catch(error){if(error.code==='ENOENT')continue;throw error;}
        if(hash(data)!==file.sha256)throw new Error('Eine Datei der alten Mod-Version wurde verändert. Bitte vor dem Versionswechsel prüfen: '+file.name);
        stale.push({name:file.name,target});
      }
    }
    // Validate every path before the first write, including existing junctions.
    for(const file of destinations.values())await safeDestination(plan.directory,file.name);
    const backup=path.join(this.options.dataDirectory,'mod-backups',randomUUID());
    await fs.mkdir(backup,{recursive:true});
    const changes=[];
    const stateFile=this.statePath(plan.directory);
    try{
      progress('Dateien sichern und installieren …');
      for(const file of stale){
        await safeDestination(plan.directory,file.name);
        const backupFile=path.join(backup,...file.name.split('/'));
        await fs.mkdir(path.dirname(backupFile),{recursive:true});await fs.copyFile(file.target,backupFile);
        changes.push({...file,backupFile,existed:true});await fs.rm(file.target);
      }
      for(const file of destinations.values()){
        const target=await safeDestination(plan.directory,file.name);
        const backupFile=path.join(backup,...file.name.split('/'));let existed=false;
        try{await fs.access(target);existed=true;}catch(error){if(error.code!=='ENOENT')throw error;}
        if(existed){await fs.mkdir(path.dirname(backupFile),{recursive:true});await fs.copyFile(target,backupFile);}
        changes.push({target,name:file.name,backupFile,existed});
        await fs.mkdir(path.dirname(target),{recursive:true});
        await fs.writeFile(target,file.data);
      }
      await fs.writeFile(path.join(backup,'installation.json'),JSON.stringify({directory:plan.directory,mods:records.map(({id,version})=>({id,version})),files:changes.map(({name,existed})=>({name,existed}))},null,2));
      await fs.mkdir(path.dirname(stateFile),{recursive:true});
      await fs.writeFile(stateFile+'.tmp',JSON.stringify(next,null,2));await fs.rename(stateFile+'.tmp',stateFile);
    }catch(error){
      const failures=[];
      for(const change of changes.reverse())try{
        await safeDestination(plan.directory,change.name);
        if(change.existed)await fs.copyFile(change.backupFile,change.target);else await fs.rm(change.target,{force:true});
      }catch(rollbackError){failures.push(rollbackError.message);}
      throw new Error(error.message+(failures.length?` Wiederherstellung unvollständig. Sicherung: ${backup}`:' Änderungen wurden zurückgesetzt.'));
    }
    return {message:'Installiert: '+records.map(item=>item.id+' '+item.version).join(', ')+'. Das Spiel muss für den ersten BepInEx-Start etwas länger laden.',backup};
  }
}
module.exports={ModManager,validateRegistry,resolveDependencies,loadRegistry,architecture,fetchBytes,unpack,safeDestination,relativeFile};
