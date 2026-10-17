const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {validate,prepareProfile,inspectGame} = require('../electron/profiles.cjs');
const {parseRepository} = require('../scripts/repository.cjs');
const base = () => ({profiles:[],originals:{Steam:'','Epic Games':''},epicLaunchUri:''});
test('validates profiles, platform and Epic URI', () => {
  assert.deepEqual(validate(base()),base());
  assert.throws(()=>validate({...base(),profiles:[{id:'1',name:'a',platform:'Unknown',directory:''}]}));
  assert.throws(()=>validate({...base(),epicLaunchUri:'https://example.com'}));
  assert.equal(validate({...base(),epicLaunchUri:'com.epicgames.launcher://apps/a%3Ab%3Ac?action=launch&silent=true'}).profiles.length,0);
});
test('parses only GitHub repository URLs', () => {
  assert.deepEqual(parseRepository('https://github.com/owner/repo.git'),{owner:'owner',repo:'repo'});
  assert.throws(()=>parseRepository('https://evil.test/owner/repo'));
  assert.throws(()=>parseRepository('https://github.com/DEIN-NAME/AmongusModManager'));
});
test('copies full installation and refuses overwrites and overlapping folders', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'orbit-test-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const source = path.join(root,'original'); const destination = path.join(root,'profile');
  await fs.mkdir(path.join(source,'Among Us_Data'),{recursive:true});
  await fs.writeFile(path.join(source,'Among Us.exe'),'test game');
  await fs.writeFile(path.join(source,'Among Us_Data','data'),'test data');
  const state={...base(), originals:{Steam:source,'Epic Games':''},profiles:[{id:'1',name:'Test',platform:'Steam',directory:destination}]};
  await prepareProfile(state,'1');
  assert.equal(await fs.readFile(path.join(destination,'Among Us_Data','data'),'utf8'),'test data');
  await assert.rejects(prepareProfile(state,'1'),/leer/);
  state.profiles[0].directory=path.join(source,'nested');
  await assert.rejects(prepareProfile(state,'1'),/überschneiden/);
  assert.equal(await fs.readFile(path.join(source,'Among Us.exe'),'utf8'),'test game');
});
test('missing executable and missing original configuration have useful messages',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-missing-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  for(const directory of [root,path.join(root,'not-created')])await assert.rejects(inspectGame(directory),error=>error.code==='GAME_NOT_FOUND'&&error.message.includes('Among Us.exe')&&!error.message.includes('ENOENT'));
  await assert.rejects(prepareProfile({...base(),profiles:[{id:'p',directory:root,platform:'Steam'}]},'p'),/unter Plattformen zuerst/);
});
test('copies into an already selected empty folder without copying over the root',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-empty-target-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const source=path.join(root,'original');const destination=path.join(root,'atr');
  await fs.mkdir(path.join(source,'Among Us_Data','nested'),{recursive:true});
  await fs.mkdir(destination);
  await fs.writeFile(path.join(source,'Among Us.exe'),'game');
  await fs.writeFile(path.join(source,'Among Us_Data','nested','data'),'data');
  const originalCopy=fs.cp;
  // Reproduce the stricter root collision behavior seen in the Electron runtime.
  t.mock.method(fs,'cp',async(from,to,options)=>{
    if(to===destination){const error=new Error('Target already exists');error.code='ERR_FS_CP_EEXIST';throw error;}
    assert.equal(options.force,false);assert.equal(options.errorOnExist,true);
    return originalCopy(from,to,options);
  });
  const state={...base(),originals:{Steam:source,'Epic Games':''},profiles:[{id:'p',platform:'Steam',directory:destination}]};
  await prepareProfile(state,'p');
  assert.equal(await fs.readFile(path.join(destination,'Among Us.exe'),'utf8'),'game');
  assert.equal(await fs.readFile(path.join(destination,'Among Us_Data','nested','data'),'utf8'),'data');
  await assert.rejects(prepareProfile(state,'p'),/leer/);
});
