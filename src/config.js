function defaultConfig() {
  return {
    sources: {
      mafab: true,
      porthu: false
    }
  }
}

function normalizeConfig(input = {}) {
  const d = defaultConfig()
  return {
    sources: {
      mafab: input?.sources?.mafab !== undefined ? Boolean(input.sources.mafab) : d.sources.mafab,
      porthu: input?.sources?.porthu !== undefined ? Boolean(input.sources.porthu) : d.sources.porthu
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
  defaultConfig,
  normalizeConfig,
  encodeConfig,
  decodeConfig,
  tryDecodeConfig
}
