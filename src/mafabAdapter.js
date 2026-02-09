const axios = require('axios')
const cheerio = require('cheerio')

const SOURCE_NAME = 'mafab.hu'
const SOURCE_URLS = [
  'https://mafab.hu/filmek/filmek/',
  'https://mafab.hu/sorozatok/sorozatok/',
  'https://mafab.hu/vod/top-streaming',
  'https://mafab.hu/cinema/premier/jelenleg-a-mozikban'
]

const META_CACHE = new Map()

const http = axios.create({
  timeout: Number(process.env.MAFAB_HTTP_TIMEOUT_MS || 12000),
  headers: {
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'hu-HU,hu;q=0.9,en;q=0.8'
  },
  validateStatus: (s) => s >= 200 && s < 400
})

function sanitizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function absolutize(base, href) {
  if (!href) return null
  try {
    return new URL(href, base).toString().split('#')[0]
  } catch {
    return null
  }
}

function extractImdbId(value) {
  const m = String(value || '').match(/tt[0-9]{5,10}/i)
  return m ? m[0].toLowerCase() : null
}

function toId(url, imdb) {
  if (imdb) return imdb
  const m = String(url || '').match(/\/movies\/([^/]+)\.html/i)
  if (m) return `mafab:${m[1].toLowerCase()}`
  return `mafab:${Buffer.from(String(url || '')).toString('base64url').slice(0, 24)}`
}

function parsePage(html, url) {
  const $ = cheerio.load(html)
  const rows = []

  $('a[href*="/movies/"]').each((_, el) => {
    const href = $(el).attr('href')
    const detail = absolutize(url, href)
    if (!detail) return

    const root = $(el).closest('article, .card, .item, .movie-box, li, div')
    const title = sanitizeText(
      $(el).attr('title') || $(el).attr('aria-label') || root.find('h1,h2,h3,h4,.title').first().text() || $(el).text()
    )
    if (!title || title.length < 2) return

    const img = root.find('img').first()
    const poster = absolutize(url, img.attr('src') || img.attr('data-src') || img.attr('data-original'))

    rows.push({
      name: title,
      url: detail,
      poster,
      description: sanitizeText(root.find('p,.description,.lead').first().text()),
      releaseInfo: sanitizeText(root.find('time').attr('datetime') || root.find('time').text()),
      imdbId: extractImdbId(root.text())
    })
  })

  return rows
}

function dedupe(rows) {
  const map = new Map()
  for (const row of rows) {
    const key = row.url
    if (!map.has(key)) map.set(key, row)
  }
  return [...map.values()]
}

function toMeta(row) {
  const imdbId = row.imdbId || extractImdbId(row.url)
  const id = toId(row.url, imdbId)
  return {
    id,
    type: 'movie',
    name: row.name,
    poster: row.poster || undefined,
    description: row.description || undefined,
    releaseInfo: row.releaseInfo || undefined,
    imdb_id: imdbId || undefined,
    website: row.url || undefined
  }
}

async function fetchCatalog({ genre, skip = 0, limit = 50 }) {
  const settled = await Promise.allSettled(SOURCE_URLS.map((u) => http.get(u)))
  const rows = []
  const warnings = []

  for (let i = 0; i < settled.length; i += 1) {
    const item = settled[i]
    if (item.status === 'fulfilled') {
      rows.push(...parsePage(item.value.data, SOURCE_URLS[i]))
    } else {
      warnings.push(`${SOURCE_URLS[i]}: ${item.reason?.message || 'failed'}`)
    }
  }

  let metas = dedupe(rows).map(toMeta)
  if (genre) {
    const g = genre.toLowerCase()
    metas = metas.filter((m) => (m.description || '').toLowerCase().includes(g) || (m.name || '').toLowerCase().includes(g))
  }
  metas.forEach((m) => META_CACHE.set(m.id, m))

  return {
    source: SOURCE_NAME,
    skip,
    limit,
    metas: metas.slice(skip, skip + limit),
    warnings: warnings.length ? warnings : undefined
  }
}

async function fetchMeta({ id }) {
  if (META_CACHE.has(id)) return { meta: META_CACHE.get(id) }
  const c = await fetchCatalog({ limit: 200, skip: 0 })
  return { meta: c.metas.find((m) => m.id === id) || null }
}

async function fetchStreams({ id }) {
  const { meta } = await fetchMeta({ id })
  if (!meta?.website) return { streams: [] }
  return {
    streams: [
      {
        name: 'Mafab',
        title: 'Open on Mafab',
        externalUrl: meta.website
      }
    ]
  }
}

module.exports = {
  fetchCatalog,
  fetchMeta,
  fetchStreams,
  SOURCE_NAME
}
