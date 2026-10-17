const {spawn} = require('node:child_process');
const path = require('node:path');
const root=path.join(__dirname,'..');
const server=spawn(process.execPath,[require.resolve('@angular/cli/bin/ng.js'),'serve','--host','127.0.0.1','--port','4201','--configuration','development'],{cwd:root,stdio:'inherit',windowsHide:true});
let exited=false;
server.once('exit',()=>exited=true);
(async()=>{
  try {
    let ready=false;
    for(let i=0;i<100;i++) {
      if(exited)throw new Error('Dev-Server vorzeitig beendet.');
      try {const response=await fetch('http://127.0.0.1:4201',{signal:AbortSignal.timeout(1000)});if(response.ok&&(await response.text()).includes('<app-root>')){ready=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,400));
    }
    if(!ready)throw new Error('Dev-Server nicht erreichbar.');
    const code=await new Promise((resolve,reject)=>{
      const child=spawn(require('electron'),['scripts/smoke.cjs','--dev-server'],{cwd:root,stdio:'inherit',windowsHide:true});
      child.once('error',reject);child.once('exit',resolve);
    });
    if(code!==0)throw new Error('Electron-Test gegen den Dev-Server fehlgeschlagen.');
    const mainCode=await new Promise((resolve,reject)=>{
      const child=spawn(require('electron'),['scripts/smoke-main.cjs','--dev'],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,ORBIT_DEV_PORT:'4201'}});
      child.once('error',reject);child.once('exit',resolve);
    });
    if(mainCode!==0)throw new Error('Test des tatsächlichen Electron-Starts fehlgeschlagen.');
  }catch(error){console.error(error);process.exitCode=1;}
  finally{
    if(!exited){
      if(process.platform==='win32')await new Promise(resolve=>spawn('taskkill',['/pid',String(server.pid),'/t','/f'],{stdio:'ignore',windowsHide:true}).once('exit',resolve));
      else server.kill('SIGTERM');
    }
  }
})();
