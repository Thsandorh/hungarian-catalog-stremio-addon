const { MAFAB_CATALOG_IDS } = require('./config')

const MAFAB_CATALOGS = {
  'mafab-movies': { type: 'movie', name: 'Mafab: Movies' },
  'mafab-series': { type: 'series', name: 'Mafab: Series' },
  'mafab-streaming': { type: 'movie', name: 'Mafab: Top streaming' },
  'mafab-cinema': { type: 'movie', name: 'Mafab: In Cinemas Now' },
  'mafab-cinema-soon': { type: 'movie', name: 'Mafab: Coming Soon' },
  'mafab-tv': { type: 'series', name: 'Mafab: TV Catalog' },
  'mafab-movies-lists': { type: 'movie', name: 'Mafab: Movie Lists' },
  'mafab-series-lists': { type: 'series', name: 'Mafab: Series Lists' },
  'mafab-streaming-premieres': { type: 'movie', name: 'Mafab: Streaming Premieres' },
  'mafab-streaming-netflix': { type: 'movie', name: 'Mafab: Top streaming / Netflix' },
  'mafab-streaming-hbo': { type: 'movie', name: 'Mafab: Top streaming / HBO Max' },
  'mafab-streaming-telekom-tvgo': { type: 'movie', name: 'Mafab: Top streaming / Telekom TVGO' },
  'mafab-streaming-cinego': { type: 'movie', name: 'Mafab: Top streaming / Cinego' },
  'mafab-streaming-filmio': { type: 'movie', name: 'Mafab: Top streaming / Filmio' },
  'mafab-streaming-amazon': { type: 'movie', name: 'Mafab: Top streaming / Amazon Prime Video' },
  'mafab-streaming-apple-tv': { type: 'movie', name: 'Mafab: Top streaming / Apple TV+' },
  'mafab-streaming-disney': { type: 'movie', name: 'Mafab: Top streaming / Disney+' },
  'mafab-streaming-skyshowtime': { type: 'movie', name: 'Mafab: Top streaming / SkyShowtime' },
  'mafab-year-window': { type: 'movie', name: 'Mafab: Movies (previous + current year)' },
  'mafab-best-current-year': { type: 'movie', name: 'Mafab: Best Movies (current year)' },
  'mafab-total-gross': { type: 'movie', name: 'Mafab: Total Gross (previous + current year)' }
}

function createManifest(config) {
  const safeConfig = config && typeof config === 'object' ? config : {}
  const sourcesConfig = safeConfig.sources && typeof safeConfig.sources === 'object' ? safeConfig.sources : {}

  const sources = []
  if (sourcesConfig.mafab) sources.push('Mafab')

  const manifestCatalogs = []

  if (sourcesConfig.mafab) {
    const enabledCatalogIds = MAFAB_CATALOG_IDS.filter((id) => safeConfig?.mafabCatalogs?.[id] !== false)
    for (const id of enabledCatalogIds) {
      const def = MAFAB_CATALOGS[id]
      if (!def) continue
      manifestCatalogs.push({ type: def.type, id, name: def.name, extra: [{ name: 'genre' }, { name: 'skip' }] })
    }
  }


  return {
    id: 'community.flix.catalogs',
    version: '2.0.2',
    name: 'Flix-Catalogs',
    description: `Configurable catalogs from ${sources.length ? sources.join(' + ') : 'selected sources'}.`,
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'mafab:'],
    catalogs: manifestCatalogs,
    behaviorHints: {
      configurable: true,
      configurationRequired: false
    }
  }
}

module.exports = { createManifest }
