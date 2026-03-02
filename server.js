const http = require('node:http')
const handler = require('./api/index')

function normalizeBasePath(value) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw || raw === '/') return ''

  let out = raw
  if (!out.startsWith('/')) out = `/${out}`
  out = out.replace(/\/+$/, '')
  return out === '/' ? '' : out
}

const APP_BASE_PATH = normalizeBasePath(process.env.APP_BASE_PATH || '')
const PORT = Number(process.env.PORT || 7000)

function stripBasePath(urlValue) {
  const url = new URL(urlValue || '/', 'http://localhost')
  if (!APP_BASE_PATH) return `${url.pathname}${url.search}`

  if (url.pathname === APP_BASE_PATH) {
    url.pathname = '/'
    return `${url.pathname}${url.search}`
  }

  if (url.pathname.startsWith(`${APP_BASE_PATH}/`)) {
    url.pathname = url.pathname.slice(APP_BASE_PATH.length) || '/'
  }

  return `${url.pathname}${url.search}`
}

const server = http.createServer((req, res) => {
  req.headers['x-app-base-path'] = APP_BASE_PATH
  req.url = stripBasePath(req.url)

  Promise.resolve(handler(req, res)).catch((error) => {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Internal server error', message: error.message }))
  })
})

const { runSync } = require('./scripts/sync')

server.listen(PORT, async () => {
  const configurePath = `${APP_BASE_PATH}/configure` || '/configure'
  console.log(`Flix-Catalogs addon ready at http://127.0.0.1:${PORT}${configurePath}`)

  console.log('Starting initial sync...')
  await runSync()
  console.log('Initial sync completed.')

  const ONE_DAY = 24 * 60 * 60 * 1000
  setInterval(async () => {
    console.log('Starting daily sync...')
    await runSync()
    console.log('Daily sync completed.')
  }, ONE_DAY)
})
