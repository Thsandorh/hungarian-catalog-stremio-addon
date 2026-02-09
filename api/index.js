const { createManifest } = require('../src/manifest')
const { defaultConfig, normalizeConfig, encodeConfig, decodeConfig, tryDecodeConfig } = require('../src/config')
const {
  fetchCatalogFromSources,
  fetchMetaFromSources,
  fetchStreamsFromSources
} = require('../src/sourceRouter')

function sendJson(res, statusCode, payload, cacheControl) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (cacheControl) res.setHeader('Cache-Control', cacheControl)
  res.end(JSON.stringify(payload))
}

function sendHtml(res, statusCode, html) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end(html)
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

function isConfigToken(segment) {
  const reserved = new Set(['configure', 'manifest.json', 'catalog', 'meta', 'stream'])
  if (!segment || reserved.has(segment)) return false
  if (!/^[A-Za-z0-9_-]{8,}$/.test(segment)) return false
  return Boolean(tryDecodeConfig(segment))
}

function parseRequestContext(pathname) {
  const segments = pathname.split('/').filter(Boolean)
  let token = null
  let rest = segments

  if (segments.length && isConfigToken(segments[0])) {
    token = segments[0]
    rest = segments.slice(1)
  }

  return { token, rest }
}

function renderConfigureHtml(origin, config) {
  const token = encodeConfig(config)
  const manifestUrl = `${origin}/${token}/manifest.json`
  const stremioUrl = `stremio://${manifestUrl}`

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Configure HU Catalog Addon</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; background:#0b1020; color:#e8ecff; margin:0; }
    .wrap { max-width:760px; margin:40px auto; padding:24px; background:#121a35; border-radius:14px; }
    h1 { margin-top:0; }
    .card { background:#0f1530; border:1px solid #25305f; padding:16px; border-radius:10px; margin:10px 0; }
    label { display:flex; gap:10px; align-items:center; font-size:18px; }
    .actions { display:flex; gap:12px; flex-wrap:wrap; margin-top:18px; }
    button, a.btn { border:0; background:#5b7cff; color:white; padding:12px 16px; border-radius:10px; cursor:pointer; text-decoration:none; font-weight:600; }
    .ghost { background:#25305f; }
    code { display:block; background:#0a1028; padding:10px; border-radius:8px; overflow:auto; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Configure HU Movies & Series Addon</h1>
    <p>Select sources. By default only <b>Mafab.hu</b> is enabled.</p>

    <form id="cfgForm">
      <div class="card"><label><input type="checkbox" id="src_mafab" ${config.sources.mafab ? 'checked' : ''}> Mafab.hu</label></div>
      <div class="card"><label><input type="checkbox" id="src_porthu" ${config.sources.porthu ? 'checked' : ''}> Port.hu</label></div>

      <div class="actions">
        <button type="submit">Generate links</button>
        <a class="btn" id="installBtn" href="${stremioUrl}">Install in Stremio</a>
      </div>
    </form>

    <h3>Manifest URL</h3>
    <code id="manifestUrl">${manifestUrl}</code>
  </div>

<script>
  const form = document.getElementById('cfgForm')
  const installBtn = document.getElementById('installBtn')
  const manifestEl = document.getElementById('manifestUrl')

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const cfg = {
      sources: {
        mafab: document.getElementById('src_mafab').checked,
        porthu: document.getElementById('src_porthu').checked
      }
    }

    const token = btoa(JSON.stringify(cfg)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
    const manifest = location.origin + '/' + token + '/manifest.json'
    manifestEl.textContent = manifest
    installBtn.href = 'stremio://' + manifest
  })
</script>
</body>
</html>`
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    const { token, rest } = parseRequestContext(url.pathname)
    const config = normalizeConfig(decodeConfig(token) || defaultConfig())
    const manifest = createManifest(config)

    if (url.pathname === '/') {
      res.statusCode = 302
      res.setHeader('Location', '/configure')
      return res.end('Redirecting to /configure')
    }

    if (rest.length === 1 && rest[0] === 'configure' && !token) {
      return sendHtml(res, 200, renderConfigureHtml(url.origin, config))
    }

    if (rest.length === 1 && rest[0] === 'manifest.json') {
      return sendJson(res, 200, manifest, 'public, max-age=300')
    }

    if (rest[0] === 'catalog') {
      const [, type, id, maybeExtra] = rest
      const extraPath = maybeExtra && maybeExtra.endsWith('.json') ? maybeExtra.slice(0, -5) : null
      const noExtra = id && id.endsWith('.json')
      const catalogId = noExtra ? id.slice(0, -5) : id

      if (type !== 'movie' || catalogId !== 'hu-mixed') return sendJson(res, 200, { metas: [] })

      const extra = {
        ...(extraPath ? parseExtraString(extraPath) : {}),
        ...parseExtraFromQuery(url.searchParams)
      }

      const limit = Math.min(Number(process.env.CATALOG_LIMIT || 50), 100)
      const skip = Math.max(Number(extra.skip || 0), 0)
      const { metas } = await fetchCatalogFromSources(config, { genre: extra.genre, skip, limit })
      return sendJson(res, 200, { metas }, 'public, s-maxage=300, stale-while-revalidate=600')
    }

    if (rest[0] === 'meta' && rest.length >= 3) {
      const id = decodeURIComponent((rest[2] || '').replace(/\.json$/, ''))
      const { meta } = await fetchMetaFromSources(config, { id })
      return sendJson(res, 200, { meta: meta || null }, 'public, max-age=300')
    }

    if (rest[0] === 'stream' && rest.length >= 3) {
      const id = decodeURIComponent((rest[2] || '').replace(/\.json$/, ''))
      const out = await fetchStreamsFromSources(config, { id })
      return sendJson(res, 200, { streams: out.streams || [] }, 'public, max-age=300')
    }

    return sendJson(res, 404, { error: 'Not found' })
  } catch (error) {
    return sendJson(res, 500, {
      error: 'Internal server error',
      message: error.message
    })
  }
}
