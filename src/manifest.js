function createManifest(config) {
  const sources = []
  if (config?.sources?.mafab) sources.push('Mafab')
  if (config?.sources?.porthu) sources.push('Port.hu')

  return {
    id: 'community.hu.multisource.catalog',
    version: '2.0.0',
    name: 'HU Movies & Series Catalog',
    description: `Configurable catalog from ${sources.length ? sources.join(' + ') : 'selected sources'}.`,
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'mafab:', 'porthu:'],
    catalogs,
    behaviorHints: {
      configurable: true,
      configurationRequired: false
    }
  }
}

module.exports = { createManifest }
