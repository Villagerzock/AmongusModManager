// Hidden Electron renderer smoke test; never touches real profile data or games.
const {app,BrowserWindow,ipcMain} = require('electron');
const path = require('node:path');
const {validateRegistry,resolveDependencies}=require('../electron/mods.cjs');
app.whenReady().then(async () => {
  let state={profiles:[],originals:{Steam:'','Epic Games':''},epicLaunchUri:''};
  ipcMain.handle('state:load',()=>state);
  ipcMain.handle('state:save',(_,next)=>{state=next;return state;});
  const registry=validateRegistry(require('../mods.json'));
  let requestedVersion='';let installed=[];let pending=[];let prepared=false;
  ipcMain.handle('mods:catalog',()=>({registry,source:'Lokal · Dev-Modus'}));
  ipcMain.handle('mods:status',()=>prepared?{ready:true,architecture:'x86',installed}:{ready:false,architecture:null,installed:[],message:'Among Us.exe fehlt. Bitte Originaldateien kopieren.'});
  ipcMain.handle('profile:prepare',(_,id)=>{if(id!==state.profiles[0].id)throw Error('Falsches Profil.');prepared=true;return 'Originaldateien kopiert.';});
  ipcMain.handle('mods:plan',(_,id,modId,version)=>{
    if(id!==state.profiles[0].id)throw new Error('Falsches Profil.');
    requestedVersion=version;
    pending=resolveDependencies(registry,modId,version).map(mod=>({id:mod.id,name:mod.name,version:mod.version,url:(mod.downloads.x86||mod.downloads.any).url,verified:true}));
    return {id:'smoke-plan',architecture:'x86',mods:pending};
  });
  ipcMain.handle('mods:install',(_,id,planId)=>{
    if(id!==state.profiles[0].id||planId!=='smoke-plan')throw new Error('Falscher Installationsplan.');
    installed=pending.map(mod=>({id:mod.id,version:mod.version,intact:true}));
    return {message:'Smoke-Installation erfolgreich.',backup:'Test-Sicherung'};
  });
  const win=new BrowserWindow({show:false,width:1280,height:860,webPreferences:{preload:path.join(__dirname,'../electron/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,offscreen:true}});
  const errors=[];
  win.webContents.on('console-message',(_event,...args)=>{const detail=typeof args[0]==='object'?args[0]:{level:args[0],message:args[1]};if(detail.level==='error'||detail.level===3)errors.push(detail.message);});
  try {
    // Exercise the real copy implementation in Electron's bundled Node runtime.
    const fs=require('node:fs/promises');
    const os=require('node:os');
    const {prepareProfile}=require('../electron/profiles.cjs');
    const copyRoot=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-electron-copy-'));
    try{
      const source=path.join(copyRoot,'original');const destination=path.join(copyRoot,'atr');
      await fs.mkdir(path.join(source,'Among Us_Data','nested'),{recursive:true});await fs.mkdir(destination);
      await fs.writeFile(path.join(source,'Among Us.exe'),'fixture exe');await fs.writeFile(path.join(source,'Among Us_Data','nested','data'),'fixture data');
      await prepareProfile({originals:{Steam:source},profiles:[{id:'copy',platform:'Steam',directory:destination}]},'copy');
      if(await fs.readFile(path.join(destination,'Among Us_Data','nested','data'),'utf8')!=='fixture data')throw Error('Electron-Profilkopie fehlgeschlagen.');
      console.log('PASS: Real profile copy into existing empty folder in Electron '+process.versions.electron+' / Node '+process.versions.node);
    }finally{await fs.rm(copyRoot,{recursive:true,force:true});}
    if (process.argv.includes('--dev-server')) await win.loadURL('http://127.0.0.1:4201');
    else await win.loadFile(path.join(__dirname,'../dist/renderer/browser/index.html'));
    for (let i=0;i<100;i++) {
      if (await win.webContents.executeJavaScript(`!!document.querySelector('.hero .primary')`)) break;
      if (errors.length) throw new Error(errors.join('\n'));
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    await win.webContents.executeJavaScript(`document.querySelector('.hero .primary').click()`);
    await win.webContents.executeJavaScript(`new Promise(resolve => setTimeout(resolve, 100))`);
    await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('#name');if(!input)throw Error('Dialog fehlt');input.value='Smoke Test';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('#directory');input.value='C:\\OrbitSmoke';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await win.webContents.executeJavaScript(`new Promise(resolve => setTimeout(resolve, 100))`);
    await win.webContents.executeJavaScript(`document.querySelector('.modal-footer .primary').click()`);
    await win.webContents.executeJavaScript(`new Promise(resolve => setTimeout(resolve, 200))`);
    const text=await win.webContents.executeJavaScript(`document.body.innerText`);
    if(!text.includes('Smoke Test') || state.profiles.length!==1)throw Error('Profil wurde nicht gespeichert/gerendert.');
    await win.webContents.executeJavaScript(`document.querySelector('.mod-manage').click()`);
    await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,200))`);
    if(!await win.webContents.executeJavaScript(`!!document.querySelector('.profile-setup')`))throw Error('Einrichtung für leeren Profilordner fehlt.');
    await win.webContents.executeJavaScript(`document.querySelector('.profile-setup .primary').click()`);
    await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,200))`);
    if(!prepared||await win.webContents.executeJavaScript(`!!document.querySelector('.profile-setup')`))throw Error('Profil-Einrichtung wurde nicht übernommen.');
    if(!await win.webContents.executeJavaScript(`document.querySelector('#mod-version-lasmonjas')?.closest('article').querySelector('button').disabled === true`))throw Error('Las Monjas muss für das x86-Testprofil gesperrt sein.');
    await win.webContents.executeJavaScript(`(()=>{const select=document.querySelector('#mod-version-atr');if(!select)throw Error('Mod-Version fehlt');select.selectedIndex=select.options.length-1;select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,100))`);
    await win.webContents.executeJavaScript(`document.querySelector('#mod-version-atr').closest('article').querySelector('button').click()`);
    await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,200))`);
    const planText=await win.webContents.executeJavaScript(`document.querySelector('.installation-plan')?.innerText`);
    if(requestedVersion!=='0.14.0'||!planText?.includes('0.14.0')||!planText.includes('Reactor · 2.5.0'))throw new Error('Versionsauswahl oder Abhängigkeitsplan fehlerhaft.');
    await win.webContents.executeJavaScript(`document.querySelector('.installation-plan .primary').click()`);
    await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,200))`);
    if(installed.find(mod=>mod.id==='atr')?.version!=='0.14.0')throw new Error('Falsche Mod-Version installiert.');
    if(await win.webContents.executeJavaScript(`document.querySelector('#mod-version-reactor').selectedOptions[0].textContent`) !== '2.5.0')throw new Error('Installierte Abhängigkeitsversion wird nicht vorausgewählt.');
    if(errors.length)throw Error(errors.join('\n'));
    await fs.mkdir(path.join(__dirname,'../dist'),{recursive:true});
    await fs.writeFile(path.join(__dirname,'../dist/preview.png'),(await win.webContents.capturePage()).toPNG());
    console.log('PASS: Electron sandbox, preload bridge, Angular rendering, create/save profile, mod version selection and dependency install UI.');
    app.exit(0);
  }catch(e){console.error(e);app.exit(1);}
});
