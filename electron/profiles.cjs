const fs = require('node:fs/promises');
const path = require('node:path');
const platforms = ['Steam', 'Epic Games'];
function validate(state) {
  if (!state || !Array.isArray(state.profiles) || state.profiles.length > 200 || !state.originals) throw new Error('Ungültige Profildaten.');
  const ids = new Set();
  for (const platform of platforms) if (typeof state.originals[platform] !== 'string') throw new Error('Ungültiger Originalpfad.');
  for (const p of state.profiles) {
    if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 80 || !platforms.includes(p.platform) || typeof p.directory !== 'string') throw new Error('Ungültiges Profil.');
    ids.add(p.id);
  }
  if (typeof state.epicLaunchUri !== 'string' || (state.epicLaunchUri && !/^com\.epicgames\.launcher:\/\/apps\/[A-Za-z0-9%:_-]+\?action=launch&silent=true$/.test(state.epicLaunchUri))) throw new Error('Ungültige Epic-Start-URI.');
  return { profiles: state.profiles.map(({id,name,platform,directory}) => ({id,name:name.trim(),platform,directory})), originals: Object.fromEntries(platforms.map(p => [p,state.originals[p]])), epicLaunchUri: state.epicLaunchUri };
}
function overlaps(a,b) {
  const relative = path.relative(a,b);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
async function inspectGame(directory) {
  if (!directory || !path.isAbsolute(directory)) throw new Error('Bitte einen absoluten Installationspfad auswählen.');
  try {
    const real = await fs.realpath(directory);
    const stat = await fs.stat(path.join(real,'Among Us.exe'));
    if (!stat.isFile()) {const error=new Error();error.code='ENOENT';throw error;}
    return real;
  } catch(error) {
    if (!['ENOENT','ENOTDIR'].includes(error.code)) throw error;
    const missing=new Error(`Im Profilordner „${directory}“ wurde keine Among Us.exe gefunden. Richte zuerst den Profilordner mit den Originaldateien ein oder wähle den vorhandenen Spielordner aus.`);
    missing.code='GAME_NOT_FOUND';throw missing;
  }
}
async function prepareProfile(state,id) {
  const profile = state.profiles.find(p => p.id === id);
  if (!profile) throw new Error('Profil nicht gefunden.');
  if(!state.originals[profile.platform])throw new Error(`Bitte unter Plattformen zuerst den Originalordner für ${profile.platform} hinterlegen und speichern.`);
  let source;
  try{source=await inspectGame(state.originals[profile.platform]);}
  catch(error){if(error.code==='GAME_NOT_FOUND')throw new Error(`Im hinterlegten Originalordner für ${profile.platform} fehlt Among Us.exe. Bitte den Originalordner unter Plattformen korrigieren.`);throw error;}
  if (!profile.directory || !path.isAbsolute(profile.directory)) throw new Error('Bitte einen absoluten Profilpfad auswählen.');
  await fs.mkdir(profile.directory,{recursive:true});
  const destination = await fs.realpath(profile.directory);
  if (overlaps(source,destination) || overlaps(destination,source)) throw new Error('Original- und Profilordner dürfen sich nicht überschneiden.');
  if ((await fs.readdir(destination)).length) throw new Error('Zum Einrichten muss der Profilordner leer sein. Bestehende Dateien werden nicht überschrieben.');
  // Reject symbolic links/junctions in the source tree, including nested entries.
  async function checkTree(dir) {
    for (const entry of await fs.readdir(dir,{withFileTypes:true})) {
      if (entry.isSymbolicLink()) throw new Error('Der Originalordner enthält symbolische Verknüpfungen.');
      if (entry.isDirectory()) await checkTree(path.join(dir,entry.name));
    }
  }
  await checkTree(source);
  // The empty destination already exists (mkdir/folder picker). Some Electron
  // Node versions reject cp(source, destination) with errorOnExist even for an
  // empty root. Copy its children instead, preserving collision protection.
  for (const entry of await fs.readdir(source,{withFileTypes:true})) {
    await fs.cp(path.join(source,entry.name),path.join(destination,entry.name),{recursive:true,force:false,errorOnExist:true});
  }
  await inspectGame(destination);
  return 'Originaldateien wurden in den Profilordner kopiert.';
}
module.exports = {validate,inspectGame,prepareProfile,overlaps};
