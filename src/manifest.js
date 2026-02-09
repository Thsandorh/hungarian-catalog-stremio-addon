function createManifest(config) {
  const safeConfig = config && typeof config === 'object' ? config : {}
  const sourcesConfig = safeConfig.sources && typeof safeConfig.sources === 'object' ? safeConfig.sources : {}

  const sources = []
  if (sourcesConfig.mafab) sources.push('Mafab')
  if (sourcesConfig.porthu) sources.push('Port.hu')

  const manifestCatalogs = []

  if (sourcesConfig.mafab) {
    manifestCatalogs.push(
      { type: 'movie', id: 'mafab-movies', name: 'Mafab: Filmek', extra: [{ name: 'genre' }, { name: 'skip' }] },
      { type: 'movie', id: 'mafab-series', name: 'Mafab: Sorozatok', extra: [{ name: 'genre' }, { name: 'skip' }] },
      { type: 'movie', id: 'mafab-streaming', name: 'Mafab: Top streaming', extra: [{ name: 'genre' }, { name: 'skip' }] },
      { type: 'movie', id: 'mafab-cinema', name: 'Mafab: Moziban most', extra: [{ name: 'genre' }, { name: 'skip' }] }
    )
  }

  if (sourcesConfig.porthu) {
    manifestCatalogs.push({
      type: 'movie',
      id: 'porthu-mixed',
      name: 'Port.hu: Film és sorozat',
      extra: [{ name: 'genre' }, { name: 'skip' }]
    })
  }


  return {
    id: 'community.hu.multisource.catalog',
    version: '2.0.1',
    name: 'HU Movies & Series Catalog',
    description: `Configurable catalog from ${sources.length ? sources.join(' + ') : 'selected sources'}.`,
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'mafab:', 'porthu:'],
    catalogs: manifestCatalogs,
    behaviorHints: {
      configurable: true,
      configurationRequired: false
    }
  }
}

module.exports = { createManifest }
