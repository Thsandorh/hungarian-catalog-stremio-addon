const { addonBuilder } = require('stremio-addon-sdk')
const { createManifest } = require('./manifest')
const { defaultConfig } = require('./config')
const {
  fetchCatalogFromSources,
  fetchMetaFromSources,
  fetchStreamsFromSources
} = require('./sourceRouter')

function createAddonInterface(config = defaultConfig()) {
  const manifest = createManifest(config)
  const builder = new addonBuilder(manifest)
  const allowedCatalogIds = new Set((manifest.catalogs || []).map((c) => c.id))

  builder.defineCatalogHandler(async ({ type, id, extra = {} }) => {
    if (!['movie', 'series'].includes(type)) return { metas: [] }
    if (!allowedCatalogIds.has(id)) return { metas: [] }
    const limit = Math.min(Number(process.env.CATALOG_LIMIT || 50), 100)
    const skip = Math.max(Number(extra.skip || 0), 0)
    const { metas } = await fetchCatalogFromSources(config, { type, catalogId: id, genre: extra.genre, skip, limit })
    return { metas }
  })

  builder.defineMetaHandler(async ({ id }) => fetchMetaFromSources(config, { id }))
  builder.defineStreamHandler(async ({ id }) => fetchStreamsFromSources(config, { id }))

  return builder.getInterface()
}

module.exports = {
  createAddonInterface
}
