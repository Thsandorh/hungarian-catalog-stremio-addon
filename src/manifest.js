const { MAFAB_CATALOG_IDS } = require('./config')

const MAFAB_CATALOGS = {
  'mafab-movies': { type: 'movie', name: 'Mafab: Filmek' },
  'mafab-series': { type: 'series', name: 'Mafab: Sorozatok' },
  'mafab-streaming': { type: 'movie', name: 'Mafab: Top streaming' },
  'mafab-cinema': { type: 'movie', name: 'Mafab: Moziban most' },
  'mafab-cinema-soon': { type: 'movie', name: 'Mafab: Hamarosan a moziban' },
  'mafab-tv': { type: 'series', name: 'Mafab: TV kínálat' },
  'mafab-movies-lists': { type: 'movie', name: 'Mafab: Filmes listák' },
  'mafab-series-lists': { type: 'series', name: 'Mafab: Sorozat listák' },
  'mafab-streaming-premieres': { type: 'movie', name: 'Mafab: Streaming premierek' },
  'mafab-streaming-netflix': { type: 'movie', name: 'Mafab: Top streaming / Netflix' },
  'mafab-streaming-hbo': { type: 'movie', name: 'Mafab: Top streaming / HBO Max' },
  'mafab-streaming-telekom-tvgo': { type: 'movie', name: 'Mafab: Top streaming / Telekom TVGO' },
  'mafab-streaming-cinego': { type: 'movie', name: 'Mafab: Top streaming / Cinego' },
  'mafab-streaming-filmio': { type: 'movie', name: 'Mafab: Top streaming / Filmio' },
  'mafab-streaming-amazon': { type: 'movie', name: 'Mafab: Top streaming / Amazon Prime Video' },
  'mafab-streaming-apple-tv': { type: 'movie', name: 'Mafab: Top streaming / Apple TV+' },
  'mafab-streaming-disney': { type: 'movie', name: 'Mafab: Top streaming / Disney+' },
  'mafab-streaming-skyshowtime': { type: 'movie', name: 'Mafab: Top streaming / SkyShowtime' },
  'mafab-year-window': { type: 'movie', name: 'Mafab: Filmek (aktuális + következő év)' },
  'mafab-best-current-year': { type: 'movie', name: 'Mafab: Legjobb filmek (aktuális év)' },
  'mafab-total-gross': { type: 'movie', name: 'Mafab: Bevételi toplista (aktuális + következő év)' }
}

function createManifest(config) {
  const safeConfig = config && typeof config === 'object' ? config : {}
  const sourcesConfig = safeConfig.sources && typeof safeConfig.sources === 'object' ? safeConfig.sources : {}

  const sources = []
  if (sourcesConfig.mafab) sources.push('Mafab')
  if (sourcesConfig.porthu) sources.push('Port.hu')

  const manifestCatalogs = []

  if (sourcesConfig.mafab) {
    const enabledCatalogIds = MAFAB_CATALOG_IDS.filter((id) => safeConfig?.mafabCatalogs?.[id] !== false)
    for (const id of enabledCatalogIds) {
      const def = MAFAB_CATALOGS[id]
      if (!def) continue
      manifestCatalogs.push({ type: def.type, id, name: def.name, extra: [{ name: 'genre' }, { name: 'skip' }] })
    }
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
