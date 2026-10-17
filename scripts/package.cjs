const fs = require('node:fs');
const path = require('node:path');
const {build} = require('electron-builder');
const {parseRepository} = require('./repository.cjs');
async function main() {
  const offline = process.argv.includes('--offline');
  let repository;
  if (!offline) repository = parseRepository(JSON.parse(fs.readFileSync(path.join(__dirname,'../release.config.json'),'utf8')).repositoryUrl);
  await build({targets: require('electron-builder').Platform.WINDOWS.createTarget(offline ? 'nsis' : 'nsis-web',require('electron-builder').Arch.x64),publish:'never',config:{
    appId:'com.orbit.amongus.manager',productName:'Orbit Among Us Manager',directories:{output:'release'},
    files:['electron/**/*','dist/renderer/browser/**/*','package.json','mods.json','release.config.json'],asar:true,
    win:{signAndEditExecutable:false},
    ...(repository ? {publish:[{provider:'github',owner:repository.owner,repo:repository.repo}]} : {}),
    nsis:{oneClick:false,allowToChangeInstallationDirectory:true,artifactName:'Orbit-Setup-${version}.${ext}'},
    nsisWeb:{oneClick:false,allowToChangeInstallationDirectory:true,artifactName:'Orbit-Web-Setup-${version}.${ext}'}
  }});
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
