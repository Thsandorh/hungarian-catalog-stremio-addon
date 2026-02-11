const { createManifest } = require('../src/manifest')
const {
  MAFAB_CATALOG_IDS,
  defaultConfig,
  normalizeConfig,
  encodeConfig,
  decodeConfig,
  tryDecodeConfig
} = require('../src/config')
const {
  fetchCatalogFromSources,
  fetchMetaFromSources,
  fetchStreamsFromSources
} = require('../src/sourceRouter')


const LOGO_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#5b7cff'/><stop offset='100%' stop-color='#00c2ff'/></linearGradient></defs><rect width='256' height='256' rx='56' fill='#0f1530'/><path d='M58 62h140v36H98v28h84v34H98v36h100v36H58V62z' fill='url(#g)'/><rect x='170' y='62' width='28' height='170' fill='#ffffff' opacity='0.9'/></svg>`


function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Max-Age', '86400')
}

function sendJson(res, statusCode, payload, cacheControl) {
  setCorsHeaders(res)
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (cacheControl) res.setHeader('Cache-Control', cacheControl)
  res.end(JSON.stringify(payload))
}

function sendHtml(res, statusCode, html) {
  setCorsHeaders(res)
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

function getRequestOrigin(req) {
  const protoHeader = (req.headers && req.headers['x-forwarded-proto']) || ''
  const hostHeader = (req.headers && req.headers['x-forwarded-host']) || (req.headers && req.headers.host) || ''

  const host = String(hostHeader).split(',')[0].trim()
  const inferredProtocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'
  const protocol = String(protoHeader).split(',')[0].trim() || inferredProtocol

  if (!host) return 'http://localhost'
  return `${protocol}://${host}`
}

function renderConfigureHtml(origin, config) {
  const token = encodeConfig(config)
  const defaultToken = encodeConfig(defaultConfig())
  const useTokenizedPath = token !== defaultToken
  const manifestPath = useTokenizedPath ? `/${token}/manifest.json` : '/manifest.json'
  const configurePath = useTokenizedPath ? `/${token}/configure` : '/configure'
  const manifestUrl = `${origin}${manifestPath}`
  const stremioManifest = manifestUrl.replace(/^https?:\/\//, '')
  const stremioUrl = `stremio://${stremioManifest}`

  const MAFAB_CATALOG_NAMES = {
    'mafab-movies': 'Movies',
    'mafab-series': 'Series',
    'mafab-streaming': 'Top Streaming',
    'mafab-cinema': 'In Cinemas Now',
    'mafab-cinema-soon': 'Coming Soon (Cinema)',
    'mafab-tv': 'TV Catalog',
    'mafab-movies-lists': 'Movie Lists',
    'mafab-series-lists': 'Series Lists',
    'mafab-streaming-premieres': 'Streaming Premieres',
    'mafab-streaming-netflix': 'Top Streaming / Netflix',
    'mafab-streaming-hbo': 'Top Streaming / HBO Max',
    'mafab-streaming-telekom-tvgo': 'Top Streaming / Telekom TVGO',
    'mafab-streaming-cinego': 'Top Streaming / Cinego',
    'mafab-streaming-filmio': 'Top Streaming / Filmio',
    'mafab-streaming-amazon': 'Top Streaming / Amazon Prime Video',
    'mafab-streaming-apple-tv': 'Top Streaming / Apple TV+',
    'mafab-streaming-disney': 'Top Streaming / Disney+',
    'mafab-streaming-skyshowtime': 'Top Streaming / SkyShowtime',
    'mafab-year-window': 'Movies (Previous + Current Year)',
    'mafab-best-current-year': 'Best Movies (Current Year)',
    'mafab-total-gross': 'Total Gross (Previous + Current Year)'
  }

  const mafabCatalogCheckboxes = MAFAB_CATALOG_IDS.map(
    (id) =>
      `<div class="card"><label><input type="checkbox" class="mafab-cat" data-id="${id}" ${
        config.mafabCatalogs?.[id] !== false ? 'checked' : ''
      }> ${MAFAB_CATALOG_NAMES[id] || id}</label></div>`
  ).join('\n      ')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Configure Flix-Catalogs Addon</title>
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
    <h1>Configure Flix-Catalogs Addon</h1>
    <p>Select enabled Mafab catalogs. Manifest and install links update automatically.</p>

    <form id="cfgForm">
      <div class="card"><label><input type="checkbox" id="src_mafab" ${config.sources.mafab ? 'checked' : ''}> Mafab.hu</label></div>
      <h3>Mafab catalogs</h3>
      ${mafabCatalogCheckboxes}
      <h3>Stream links</h3>
      <div class="card"><label><input type="checkbox" id="feature_externalLinks" ${config.features?.externalLinks !== false ? 'checked' : ''}> Enable external links (Mafab + Ko-fi)</label></div>

      <div class="actions">
        <a class="btn" id="installBtn" href="${stremioUrl}">Install in Stremio</a>
      </div>
    </form>

    <h3>Manifest URL</h3>
    <code id="manifestUrl">${manifestUrl}</code>

    <h3>Support & Community</h3>
    <p>If this addon is useful for you, you can support development or join the community:</p>
    <div class="actions">
      <a class="btn" href="https://ko-fi.com/sandortoth" target="_blank" rel="noopener noreferrer">Support on Ko-fi</a>
      <a class="btn ghost" href="https://discord.gg/GnKRAwwdcQ" target="_blank" rel="noopener noreferrer">Discord Server</a>
    </div>
  </div>

<script>
  const form = document.getElementById('cfgForm')
  const installBtn = document.getElementById('installBtn')
  const manifestEl = document.getElementById('manifestUrl')
  const defaultToken = ${JSON.stringify(encodeConfig(defaultConfig()))}

  function encodeConfigToken(cfg) {
    const json = JSON.stringify(cfg)
    const bytes = new TextEncoder().encode(json)
    let binary = ''
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte)
    })
    return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '')
  }

  function buildConfig() {
    const cfg = {
      sources: {
        mafab: document.getElementById('src_mafab').checked
      },
      mafabCatalogs: {},
      features: {
        externalLinks: document.getElementById('feature_externalLinks').checked
      }
    }

    document.querySelectorAll('.mafab-cat').forEach((el) => {
      cfg.mafabCatalogs[el.dataset.id] = el.checked
    })

    return cfg
  }

  function updateLinks() {
    const cfg = buildConfig()
    const token = encodeConfigToken(cfg)
    const useTokenizedPath = token !== defaultToken
    const manifestPath = useTokenizedPath ? '/' + token + '/manifest.json' : '/manifest.json'
    const configurePath = useTokenizedPath ? '/' + token + '/configure' : '/configure'
    const manifest = location.origin + manifestPath
    manifestEl.textContent = manifest
    installBtn.href = 'stremio://' + manifest.replace(/^https?:\\/\\//, '')
    history.replaceState(null, '', configurePath)
  }

  form.addEventListener('change', updateLinks)
  form.addEventListener('input', updateLinks)
  updateLinks()
</script>
</body>
</html>`
}

module.exports = async (req, res) => {
  try {
    if ((req.method || 'GET').toUpperCase() === 'OPTIONS') {
      setCorsHeaders(res)
      res.statusCode = 204
      return res.end('')
    }

    const url = new URL(req.url, 'http://localhost')
    const { token, rest } = parseRequestContext(url.pathname)
    const config = normalizeConfig(decodeConfig(token) || defaultConfig())
    const manifest = createManifest(config)

    if (url.pathname === '/') {
      setCorsHeaders(res)
      res.statusCode = 302
      res.setHeader('Location', '/configure')
      return res.end('Redirecting to /configure')
    }

    if (rest.length === 1 && rest[0] === 'configure') {
      return sendHtml(res, 200, renderConfigureHtml(getRequestOrigin(req), config))
    }

    if (rest.length === 1 && rest[0] === 'manifest.json') {
      return sendJson(
        res,
        200,
        {
          ...manifest,
          logo: '/logo.svg'
        },
        'public, max-age=300'
      )
    }

    if (rest.length === 1 && rest[0] === 'logo.svg') {
      setCorsHeaders(res)
      res.statusCode = 200
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
      res.setHeader('Cache-Control', 'public, max-age=86400')
      return res.end(LOGO_SVG)
    }

    if (rest[0] === 'catalog') {
      const [, type, id, maybeExtra] = rest
      const extraPath = maybeExtra && maybeExtra.endsWith('.json') ? maybeExtra.slice(0, -5) : null
      const noExtra = id && id.endsWith('.json')
      const catalogId = noExtra ? id.slice(0, -5) : id

      if (!['movie', 'series'].includes(type)) return sendJson(res, 200, { metas: [] })

      const extra = {
        ...(extraPath ? parseExtraString(extraPath) : {}),
        ...parseExtraFromQuery(url.searchParams)
      }

      const limit = Math.min(Number(process.env.CATALOG_LIMIT || 50), 100)
      const skip = Math.max(Number(extra.skip || 0), 0)
      const { metas } = await fetchCatalogFromSources(config, { type, catalogId, genre: extra.genre, skip, limit })
      return sendJson(res, 200, { metas }, 'public, s-maxage=300, stale-while-revalidate=600')
    }

    if (rest[0] === 'meta' && rest.length >= 3) {
      const id = decodeURIComponent((rest[2] || '').replace(/\.json$/, ''))
      const { meta } = await fetchMetaFromSources(config, { id })
      return sendJson(res, 200, { meta: meta || null }, 'public, max-age=300')
    }

    if (rest[0] === 'stream' && rest.length >= 3) {
      const type = rest[1]
      const id = decodeURIComponent((rest[2] || '').replace(/\.json$/, ''))
      const out = await fetchStreamsFromSources(config, { type, id })
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

module.exports._internals = { getRequestOrigin, renderConfigureHtml }
