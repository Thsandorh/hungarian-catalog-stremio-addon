const MAFAB_CATALOG_IDS = [
  'mafab-movies',
  'mafab-series',
  'mafab-streaming',
  'mafab-cinema',
  'mafab-cinema-soon',
  'mafab-tv',
  'mafab-movies-lists',
  'mafab-series-lists',
  'mafab-streaming-premieres',
  'mafab-streaming-netflix',
  'mafab-streaming-hbo',
  'mafab-streaming-telekom-tvgo',
  'mafab-streaming-cinego',
  'mafab-streaming-filmio',
  'mafab-streaming-amazon',
  'mafab-streaming-apple-tv',
  'mafab-streaming-disney',
  'mafab-streaming-skyshowtime',
  'mafab-year-window',
  'mafab-best-current-year',
  'mafab-total-gross'
]

function defaultConfig() {
  const mafabCatalogs = Object.fromEntries(MAFAB_CATALOG_IDS.map((id) => [id, true]))

  return {
    sources: {
      mafab: true,
      porthu: false
    },
    mafabCatalogs,
    features: {
      externalLinks: true
    }
  }
}

function normalizeConfig(input = {}) {
  const d = defaultConfig()

  const normalizedMafabCatalogs = Object.fromEntries(
    MAFAB_CATALOG_IDS.map((id) => {
      const value = input?.mafabCatalogs?.[id]
      return [id, value !== undefined ? Boolean(value) : d.mafabCatalogs[id]]
    })
  )

  return {
    sources: {
      mafab: input?.sources?.mafab !== undefined ? Boolean(input.sources.mafab) : d.sources.mafab,
      porthu: input?.sources?.porthu !== undefined ? Boolean(input.sources.porthu) : d.sources.porthu
    },
    mafabCatalogs: normalizedMafabCatalogs,
    features: {
      externalLinks:
        input?.features?.externalLinks !== undefined
          ? Boolean(input.features.externalLinks)
          : d.features.externalLinks
    }
  }
}

function encodeConfig(config) {
  const json = JSON.stringify(normalizeConfig(config))
  return Buffer.from(json, 'utf8').toString('base64url')
}

function tryDecodeConfig(token) {
  if (!token) return null
  try {
    const json = Buffer.from(token, 'base64url').toString('utf8')
    const parsed = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object' || typeof parsed.sources !== 'object') return null
    return normalizeConfig(parsed)
  } catch {
    return null
  }
}

function decodeConfig(token) {
  return tryDecodeConfig(token) || defaultConfig()
}

module.exports = {
  MAFAB_CATALOG_IDS,
  defaultConfig,
  normalizeConfig,
  encodeConfig,
  decodeConfig,
  tryDecodeConfig
}
