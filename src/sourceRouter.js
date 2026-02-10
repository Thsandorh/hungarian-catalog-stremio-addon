const porthu = require('./porthuAdapter')
const mafab = require('./mafabAdapter')

function selectedAdapters(config) {
  const adapters = []
  if (config?.sources?.mafab) adapters.push(mafab)
  if (config?.sources?.porthu) adapters.push(porthu)
  return adapters
}

function adaptersForCatalog(config, catalogId) {
  if (String(catalogId || '').startsWith('mafab-')) return config?.sources?.mafab ? [mafab] : []
  if (String(catalogId || '').startsWith('porthu-')) return config?.sources?.porthu ? [porthu] : []
  return []
}

function dedupeMetas(metas) {
  const map = new Map()
  for (const m of metas) {
    if (!m || !m.id) continue
    if (!map.has(m.id)) map.set(m.id, m)
  }
  return [...map.values()]
}

async function fetchCatalogFromSources(config, { catalogId, genre, skip, limit }) {
  const adapters = adaptersForCatalog(config, catalogId)
  if (!adapters.length) return { metas: [] }

  const settled = await Promise.allSettled(adapters.map((a) => a.fetchCatalog({ catalogId, genre, skip: 0, limit: 250 })))
  const metas = []
  const warnings = []

  settled.forEach((item, i) => {
    const adapter = adapters[i]
    if (item.status === 'fulfilled') {
      metas.push(...(item.value.metas || []))
      if (item.value.warnings?.length) warnings.push(...item.value.warnings)
    } else {
      warnings.push(`${adapter.SOURCE_NAME}: ${item.reason?.message || 'failed'}`)
    }
  })

  const merged = dedupeMetas(metas).slice(skip, skip + limit)
  return { metas: merged, warnings }
}

async function fetchMetaFromSources(config, { id }) {
  const adapters = selectedAdapters(config)
  for (const a of adapters) {
    try {
      const out = await a.fetchMeta({ id })
      if (out?.meta) return { meta: out.meta }
    } catch {
      // no-op
    }
  }
  return { meta: null }
}

async function fetchStreamsFromSources(config, { id }) {
  const adapters = selectedAdapters(config)
  for (const a of adapters) {
    try {
      const out = await a.fetchStreams({ id })
      if (out?.streams?.length) return out
    } catch {
      // no-op
    }
  }
  return { streams: [] }
}

module.exports = {
  fetchCatalogFromSources,
  fetchMetaFromSources,
  fetchStreamsFromSources
}
