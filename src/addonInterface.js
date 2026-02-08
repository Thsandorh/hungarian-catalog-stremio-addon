const { addonBuilder } = require('stremio-addon-sdk')
const { fetchCatalog, SOURCE_NAME } = require('./porthuAdapter')

const manifest = {
  id: 'community.porthu.catalog',
  version: '1.1.0',
  name: 'Port.hu Catalog',
  description: 'Stremio catalog addon for Port.hu movie and series listings.',
  resources: ['catalog'],
  types: ['movie', 'series'],
  idPrefixes: ['porthu:'],
  catalogs: [
    {
      type: 'movie',
      id: 'porthu-movie',
      name: 'Port.hu Movies',
      extra: [{ name: 'genre' }, { name: 'skip' }]
    },
    {
      type: 'series',
      id: 'porthu-series',
      name: 'Port.hu Series',
      extra: [{ name: 'genre' }, { name: 'skip' }]
    }
  ]
}

function createAddonInterface() {
  const builder = new addonBuilder(manifest)

  builder.defineCatalogHandler(async ({ type, id, extra = {} }) => {
    if (!['movie', 'series'].includes(type)) return { metas: [] }
    if (id !== `porthu-${type}`) return { metas: [] }

    const limit = Math.min(Number(process.env.CATALOG_LIMIT || 50), 100)
    const skip = Math.max(Number(extra.skip || 0), 0)

    const result = await fetchCatalog({
      type,
      genre: extra.genre,
      skip,
      limit
    })

    if (result.warnings?.length) {
      console.warn(`[${SOURCE_NAME}] catalog warnings:\n${result.warnings.join('\n')}`)
    }

    return { metas: result.metas }
  })

  return builder.getInterface()
}

module.exports = {
  manifest,
  createAddonInterface
}
