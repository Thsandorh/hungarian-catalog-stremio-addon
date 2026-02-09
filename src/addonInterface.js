const { addonBuilder } = require('stremio-addon-sdk')
const { fetchCatalog, fetchMeta, fetchStreams, SOURCE_NAME } = require('./porthuAdapter')
const { manifest } = require('./manifest')

function createAddonInterface() {
  const builder = new addonBuilder(manifest)

  builder.defineCatalogHandler(async ({ type, id, extra = {} }) => {
    if (type !== 'movie') return { metas: [] }
    if (id !== 'porthu-mixed') return { metas: [] }

    const limit = Math.min(Number(process.env.CATALOG_LIMIT || 50), 100)
    const skip = Math.max(Number(extra.skip || 0), 0)

    try {
      const [movieResult, seriesResult] = await Promise.all([
        fetchCatalog({ type: 'movie', genre: extra.genre, skip: 0, limit: 200 }),
        fetchCatalog({ type: 'series', genre: extra.genre, skip: 0, limit: 200 })
      ])

      const metas = [...movieResult.metas, ...seriesResult.metas].slice(skip, skip + limit)
      const warnings = [...(movieResult.warnings || []), ...(seriesResult.warnings || [])]
      if (warnings.length) {
        console.warn(`[${SOURCE_NAME}] catalog warnings:\n${warnings.join('\n')}`)
      }

      return { metas }
    } catch (error) {
      console.error(`[${SOURCE_NAME}] catalog handler failed: ${error.message}`)
      return { metas: [] }
    }
  })

  builder.defineMetaHandler(async ({ type, id }) => {
    if (!['movie', 'series'].includes(type)) return { meta: null }

    try {
      const result = await fetchMeta({ type, id })
      return { meta: result.meta || null }
    } catch (error) {
      console.error(`[${SOURCE_NAME}] meta handler failed: ${error.message}`)
      return { meta: null }
    }
  })

  builder.defineStreamHandler(async ({ type, id }) => {
    if (!['movie', 'series'].includes(type)) return { streams: [] }

    try {
      return fetchStreams({ type, id })
    } catch (error) {
      console.error(`[${SOURCE_NAME}] stream handler failed: ${error.message}`)
      return { streams: [] }
    }
  })

  return builder.getInterface()
}

module.exports = {
  manifest,
  createAddonInterface
}
