const {app,BrowserWindow} = require('electron');
const errors=[];
app.on('web-contents-created',(_event,contents)=>{
  contents.on('console-message',(_event,...args)=>{
    const detail=typeof args[0]==='object'?args[0]:{level:args[0],message:args[1]};
    if(detail.level==='error'||detail.level===3)errors.push(detail.message);
  });
});
require('../electron/main.cjs');
app.whenReady().then(async()=>{
  try{
    let ready=false;
    let snapshot=[];
    for(let i=0;i<150;i++){
      snapshot=BrowserWindow.getAllWindows().map(win=>({url:win.webContents.getURL(),visible:win.isVisible(),loading:win.webContents.isLoadingMainFrame(),tools:win.webContents.isDevToolsOpened()}));
      const win=BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().startsWith('http://127.0.0.1:4201'));
      if(win && !win.webContents.isLoadingMainFrame()) {
        const rendered=await win.webContents.executeJavaScript(`!!document.querySelector('.hero .primary') && !!window.manager`);
        if(!rendered && i===149) console.log(await win.webContents.executeJavaScript(`({text:document.body.innerText,html:document.querySelector('app-root')?.innerHTML,bridge:!!window.manager})`));
        if(rendered && win.isVisible() && win.webContents.isDevToolsOpened()){ready=true;break;}
      }
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    if(!ready)throw new Error('App-Fenster, Angular oder DevTools nicht bereit. '+JSON.stringify(snapshot)+' '+errors.join('\n'));
    const appErrors=errors.filter(message=>!message.startsWith('Request Autofill.'));
    if(appErrors.length)throw new Error(appErrors.join('\n'));
    console.log('PASS: Tatsächlicher Electron-Main-Prozess zeigt App-Fenster mit Angular-Oberfläche, Preload und angedockten DevTools.');
    app.exit(0);
  }catch(error){console.error(error);app.exit(1);}
});
