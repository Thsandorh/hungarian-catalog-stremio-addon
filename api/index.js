const { fetchCatalog, fetchMeta, fetchStreams } = require('../src/porthuAdapter')
const { manifest } = require('../src/manifest')

function sendJson(res, statusCode, payload, cacheControl) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (cacheControl) res.setHeader('Cache-Control', cacheControl)
  res.end(JSON.stringify(payload))
}

function parseExtraString(extraStr) {
  if (!extraStr) return {}
  return extraStr.split('&').reduce((acc, pair) => {
    const [rawKey, rawValue = ''] = pair.split('=')
    if (!rawKey) return acc
    acc[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue)
    return acc
  }, {})
}

function parseExtraFromQuery(searchParams) {
  const extra = {}
  for (const [key, value] of searchParams.entries()) extra[key] = value
  return extra
}

function isValidCatalog(type, id) {
  return type === 'movie' && id === 'porthu-mixed'
}

async function handleCatalog(type, id, extra, res) {
  if (!isValidCatalog(type, id)) return sendJson(res, 200, { metas: [] })

  const limit = Math.min(Number(process.env.CATALOG_LIMIT || 50), 100)
  const skip = Math.max(Number(extra.skip || 0), 0)

  try {
    const result = await fetchCatalog({ genre: extra.genre, skip, limit })
    return sendJson(res, 200, { metas: result.metas }, 'public, s-maxage=300, stale-while-revalidate=600')
  } catch (error) {
    console.error(`catalog fetch failed: ${error.message}`)
    return sendJson(res, 200, { metas: [] }, 'public, max-age=60')
  }
}

async function handleMeta(id, res) {
  try {
    const result = await fetchMeta({ id })
    return sendJson(res, 200, { meta: result.meta || null }, 'public, max-age=300')
  } catch (error) {
    console.error(`meta fetch failed: ${error.message}`)
    return sendJson(res, 200, { meta: null }, 'public, max-age=60')
  }
}

async function handleStream(id, res) {
  try {
    const result = await fetchStreams({ id })
    return sendJson(res, 200, { streams: result.streams || [] }, 'public, max-age=300')
  } catch (error) {
    console.error(`stream fetch failed: ${error.message}`)
    return sendJson(res, 200, { streams: [] }, 'public, max-age=60')
  }
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    const path = url.pathname

    if (path === '/' || path === '/manifest.json') {
      return sendJson(res, 200, manifest, 'public, max-age=300')
    }

    const withExtra = path.match(/^\/catalog\/([^/]+)\/([^/]+)\/(.+)\.json$/)
    if (withExtra) {
      const [, type, id, extraEncoded] = withExtra
      const extra = { ...parseExtraString(extraEncoded), ...parseExtraFromQuery(url.searchParams) }
      return handleCatalog(type, id, extra, res)
    }

    const withoutExtra = path.match(/^\/catalog\/([^/]+)\/([^/]+)\.json$/)
    if (withoutExtra) {
      const [, type, id] = withoutExtra
      return handleCatalog(type, id, parseExtraFromQuery(url.searchParams), res)
    }

    const metaMatch = path.match(/^\/meta\/([^/]+)\/(.+)\.json$/)
    if (metaMatch) {
      const [, , id] = metaMatch
      return handleMeta(decodeURIComponent(id), res)
    }

    const streamMatch = path.match(/^\/stream\/([^/]+)\/(.+)\.json$/)
    if (streamMatch) {
      const [, , id] = streamMatch
      return handleStream(decodeURIComponent(id), res)
    }

    return sendJson(res, 404, { error: 'Not found' })
  } catch (error) {
    return sendJson(res, 500, {
      error: 'Internal server error',
      message: error.message
    })
  }
}
