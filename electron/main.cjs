const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {validate,inspectGame,prepareProfile} = require('./profiles.cjs');
const {ModManager} = require('./mods.cjs');
const development = !app.isPackaged && process.argv.includes('--dev');
const devPort = Number(process.env.ORBIT_DEV_PORT || 4200);
const devUrl = `http://127.0.0.1:${Number.isInteger(devPort) && devPort > 0 && devPort < 65536 ? devPort : 4200}`;
if (development) app.setPath('userData', path.join(app.getPath('appData'),'orbit-development'));
let window;
let busy = false;
const defaults = () => ({profiles:[],originals:{Steam:'','Epic Games':''},epicLaunchUri:''});
const stateFile = () => path.join(app.getPath('userData'),'profiles.json');
async function readState() {
  try { return validate(JSON.parse(await fs.readFile(stateFile(),'utf8'))); }
  catch (e) { if (e.code === 'ENOENT') return defaults(); throw new Error('Die Profildatei konnte nicht gelesen werden. Bitte profiles.json im App-Datenordner prüfen.'); }
}
app.whenReady().then(() => {
  const mods = new ModManager({localFile:path.join(__dirname,'../mods.json'),modsUrl:require('../release.config.json').modsUrl || '',development:!app.isPackaged,dataDirectory:app.getPath('userData')});
  window = new BrowserWindow({show:false,width:development ? 1600 : 1280,height:860,minWidth:960,minHeight:700,backgroundColor:'#0c101a',autoHideMenuBar:true,title:'Orbit · Among Us Manager',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  window.once('ready-to-show',() => {window.show();window.focus();});
  window.webContents.on('did-finish-load',() => {
    if (development) window.webContents.openDevTools({mode:'right',activate:false});
    window.show();
    window.focus();
    window.webContents.focus();
  });
  window.webContents.on('did-fail-load',(_event,code,description,url) => console.error(`Ladefehler ${code}: ${description} (${url})`));
  window.webContents.on('render-process-gone',(_event,details) => console.error('Renderer beendet:',details.reason));
  window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  window.webContents.on('will-navigate',e => e.preventDefault());
  if (development) {
    window.loadURL(devUrl).catch(error => {console.error('Dev-Oberfläche konnte nicht geladen werden:',error);window.show();});
  } else {
    window.loadFile(path.join(__dirname,'../dist/renderer/browser/index.html'));
  }
  const handle = (channel, fn) => ipcMain.handle(channel, async (event,...args) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Unzulässiger Zugriff.');
    return fn(...args);
  });
  handle('state:load',readState);
  const profileById = async id => {
    const profile = (await readState()).profiles.find(profile=>profile.id===id);
    if(!profile)throw new Error('Profil nicht gefunden.');
    return profile;
  };
  handle('mods:catalog',() => mods.load());
  handle('mods:status',async id => mods.status(await profileById(id)));
  handle('mods:plan',async (id,modId,version) => mods.plan(await profileById(id),modId,version));
  handle('mods:install',async (id,planId) => {
    if(busy)throw new Error('Bitte die laufende Dateioperation abwarten.');
    busy=true;
    try{return await mods.install(await profileById(id),planId,message=>window.webContents.send('mods:progress',message));}
    finally{busy=false;}
  });
  handle('state:save',async state => {
    if (busy) throw new Error('Ein Profil wird gerade eingerichtet.');
    const checked = validate(state);
    await fs.mkdir(app.getPath('userData'),{recursive:true});
    await fs.writeFile(stateFile()+'.tmp',JSON.stringify(checked,null,2),'utf8');
    await fs.rename(stateFile()+'.tmp',stateFile());
    return checked;
  });
  handle('folder:pick',async () => { const result = await dialog.showOpenDialog(window,{properties:['openDirectory','createDirectory']}); return result.canceled ? null : result.filePaths[0]; });
  handle('profile:prepare',async id => {
    if (busy) throw new Error('Bitte den aktuellen Kopiervorgang abwarten.');
    busy = true;
    try { return await prepareProfile(await readState(),id); } finally { busy=false; }
  });
  handle('profile:open',async id => {
    const p = (await readState()).profiles.find(p => p.id === id);
    if (!p || !p.directory) throw new Error('Bitte einen Profilordner festlegen.');
    const error = await shell.openPath(p.directory); if (error) throw new Error(error);
  });
  handle('profile:launch',async id => {
    if (busy) throw new Error('Bitte den Kopiervorgang abwarten.');
    const state = await readState();
    const p = state.profiles.find(p => p.id === id);
    if (!p) throw new Error('Profil nicht gefunden.');
    const directory = await inspectGame(p.directory);
    if (p.platform === 'Steam') {
      await shell.openExternal('steam://open/main');
      const child = spawn(path.join(directory,'Among Us.exe'),[],{cwd:directory,detached:true,stdio:'ignore',env:{...process.env,SteamAppId:'945360',SteamGameId:'945360'}});
      await new Promise((resolve,reject) => {child.once('spawn',resolve);child.once('error',reject);}); child.unref();
      return 'Steam wurde geöffnet und das Profil gestartet. Steam muss angemeldet sein.';
    }
    if (!state.epicLaunchUri) throw new Error('Bitte unter Plattformen die Epic-Start-URI hinterlegen.');
    const original = await inspectGame(state.originals['Epic Games']);
    if (original.toLowerCase() !== directory.toLowerCase()) throw new Error('Epic startet über den Launcher ausschließlich dessen registrierten Installationsordner. Wähle diesen als Profilordner. Separate Epic-Kopien können ohne Launcher-Authentifizierung nicht zuverlässig gestartet werden.');
    await shell.openExternal(state.epicLaunchUri);
    return 'Start an den Epic Games Launcher übergeben.';
  });
});
app.on('window-all-closed',() => app.quit());
