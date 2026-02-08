const { createAddonInterface } = require('../src/addonInterface')

const addonInterface = createAddonInterface()

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
    const key = decodeURIComponent(rawKey)
    const value = decodeURIComponent(rawValue)
    acc[key] = value
    return acc
  }, {})
}

function parseExtraFromQuery(searchParams) {
  const extra = {}
  for (const [key, value] of searchParams.entries()) {
    extra[key] = value
  }
  return extra
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    const path = url.pathname

    if (path === '/' || path === '/manifest.json') {
      return sendJson(res, 200, addonInterface.manifest, 'public, max-age=300')
    }

    const catalogWithExtra = path.match(/^\/catalog\/([^/]+)\/([^/]+)\/(.+)\.json$/)
    if (catalogWithExtra) {
      const [, type, id, extraEncoded] = catalogWithExtra
      const pathExtra = parseExtraString(extraEncoded)
      const queryExtra = parseExtraFromQuery(url.searchParams)
      const extra = { ...pathExtra, ...queryExtra }
      const payload = await addonInterface.catalog({ type, id, extra })
      return sendJson(res, 200, payload, 'public, s-maxage=300, stale-while-revalidate=600')
    }

    const catalogWithoutExtra = path.match(/^\/catalog\/([^/]+)\/([^/]+)\.json$/)
    if (catalogWithoutExtra) {
      const [, type, id] = catalogWithoutExtra
      const extra = parseExtraFromQuery(url.searchParams)
      const payload = await addonInterface.catalog({ type, id, extra })
      return sendJson(res, 200, payload, 'public, s-maxage=300, stale-while-revalidate=600')
    }

    return sendJson(res, 404, { error: 'Not found' })
  } catch (error) {
    return sendJson(res, 500, {
      error: 'Internal server error',
      message: error.message
    })
  }
}
