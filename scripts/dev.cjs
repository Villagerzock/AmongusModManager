const {spawn} = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const root = path.join(__dirname,'..');
let server;
let electron;
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of [electron,server]) {
    if (!child || child.exitCode !== null || !child.pid) continue;
    if (process.platform === 'win32') {
      spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{stdio:'ignore',windowsHide:true});
    } else child.kill('SIGTERM');
  }
}

async function main() {
  // Refuse an occupied port so Electron never loads an unrelated local server.
  await new Promise((resolve,reject) => {
    const probe=net.createServer();
    probe.once('error',()=>reject(new Error('Port 4200 ist bereits belegt. Bitte den anderen Dev-Server zuerst beenden.')));
    probe.listen(4200,'127.0.0.1',()=>probe.close(resolve));
  });
  server=spawn(process.execPath,[require.resolve('@angular/cli/bin/ng.js'),'serve','--host','127.0.0.1','--port','4200','--configuration','development'],{cwd:root,stdio:'inherit',windowsHide:true});
  server.once('error',error=>{console.error(error.message);stop(1);});
  server.once('exit',code=>{if (!stopping)stop(code || 1);});
  const deadline=Date.now()+120000;
  while (!stopping) {
    try {
      const response=await fetch('http://127.0.0.1:4200',{signal:AbortSignal.timeout(1500)});
      const html=await response.text();
      if(response.ok && html.includes('<app-root>'))break;
    } catch {}
    if(Date.now()>deadline)throw new Error('Angular war nach 120 Sekunden noch nicht bereit.');
    await new Promise(resolve=>setTimeout(resolve,400));
  }
  if(stopping)return;
  electron=spawn(require('electron'),['--inspect=127.0.0.1:9229','.', '--dev'],{cwd:root,stdio:'inherit',windowsHide:true});
  electron.once('error',error=>{console.error(error.message);stop(1);});
  electron.once('exit',code=>stop(code || 0));
  console.log('\nEntwicklungsumgebung bereit: Angular auf http://127.0.0.1:4200, Electron mit angedockten DevTools.');
  console.log('Angular/SCSS: automatisches Neuladen. Electron/Preload: npm run dev neu starten.');
  console.log('Main-Process-Debugger: 127.0.0.1:9229. Beenden: Electron schließen oder Strg+C.\n');
}
process.on('SIGINT',()=>stop());
process.on('SIGTERM',()=>stop());
main().catch(error=>{console.error(error.message);stop(1);});
