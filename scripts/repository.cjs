function parseRepository(url) {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url || '');
  if (!match || match[1] === 'DEIN-NAME') throw new Error('Bitte in release.config.json eine echte öffentliche GitHub-Repository-URL eintragen, z. B. https://github.com/name/repository.');
  return {owner:match[1],repo:match[2]};
}
module.exports={parseRepository};
