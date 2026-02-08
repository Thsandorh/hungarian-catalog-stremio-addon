const crypto = require('node:crypto')
const { URL } = require('node:url')

const axios = require('axios')
const cheerio = require('cheerio')

const SOURCE_NAME = 'port.hu'
const DEFAULT_TIMEOUT_MS = Number(process.env.PORT_HU_HTTP_TIMEOUT_MS || 12000)

const CATALOG_URLS = {
  movie: ['https://port.hu/film', 'https://port.hu/mozi', 'https://port.hu'],
  series: ['https://port.hu/tv', 'https://port.hu/sorozat', 'https://port.hu']
}

const META_CACHE = new Map()

const http = axios.create({
  timeout: DEFAULT_TIMEOUT_MS,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,hu;q=0.8'
  },
  validateStatus: (s) => s >= 200 && s < 400
})

function sanitizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function canonicalizeUrl(value) {
  if (!value) return null
  try {
    const url = new URL(value)
    url.hash = ''
    url.search = ''
    return url.toString()
  } catch {
    return value.split('#')[0].split('?')[0]
  }
}

function absolutize(baseUrl, maybeRelative) {
  if (!maybeRelative) return null
  try {
    return canonicalizeUrl(new URL(maybeRelative, baseUrl).toString())
  } catch {
    return null
  }
}

function extractEntityId(url) {
  const text = String(url || '')
  const m = text.match(/\/(movie|episode|person|event)-([0-9]+)/i)
  if (m) return `${m[1].toLowerCase()}-${m[2]}`
  return null
}

function makeMetaId(type, canonicalUrl, name) {
  const entityId = extractEntityId(canonicalUrl)
  if (entityId) return `porthu:${type}:${entityId}`
  const hash = crypto
    .createHash('sha1')
    .update(`${type}:${canonicalUrl || name || ''}`)
    .digest('hex')
    .slice(0, 24)
  return `porthu:${type}:h-${hash}`
}

function parseJsonLdBlocks($, pageUrl) {
  const scripts = $('script[type="application/ld+json"]').toArray()
  const items = []

  for (const script of scripts) {
    const raw = $(script).contents().text()
    if (!raw) continue

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      continue
    }

    const arr = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed]

    for (const entry of arr) {
      if (!entry || typeof entry !== 'object') continue

      if (Array.isArray(entry.itemListElement)) {
        for (const listEl of entry.itemListElement) {
          const item = listEl.item || listEl
          if (!item || typeof item !== 'object') continue
          items.push({
            name: sanitizeText(item.name || listEl.name),
            url: absolutize(pageUrl, item.url || listEl.url),
            poster: absolutize(pageUrl, item.image),
            description: sanitizeText(item.description),
            releaseInfo: sanitizeText(item.datePublished || item.releaseDate),
            genre: sanitizeText(Array.isArray(item.genre) ? item.genre.join(', ') : item.genre)
          })
        }
      }

      const type = entry['@type']
      const typeArr = Array.isArray(type) ? type : [type]
      if (typeArr.some((t) => ['Movie', 'TVSeries', 'CreativeWork'].includes(t))) {
        items.push({
          name: sanitizeText(entry.name),
          url: absolutize(pageUrl, entry.url),
          poster: absolutize(pageUrl, entry.image),
          description: sanitizeText(entry.description),
          releaseInfo: sanitizeText(entry.datePublished || entry.releaseDate),
          genre: sanitizeText(Array.isArray(entry.genre) ? entry.genre.join(', ') : entry.genre)
        })
      }
    }
  }

  return items
}

function parseDomCards($, pageUrl) {
  const items = []
  const cardSelectors = [
    'a[href*="/adatlap/film/"]',
    'a[href*="/adatlap/sorozat/"]',
    'article a[href]',
    '.card a[href]',
    '.item a[href]'
  ]

  for (const sel of cardSelectors) {
    $(sel).each((_, el) => {
      const href = $(el).attr('href')
      const canonical = absolutize(pageUrl, href)
      if (!canonical || !canonical.includes('/adatlap/')) return

      const root = $(el).closest('article, .card, .item, li, div')
      const name = sanitizeText($(el).attr('title') || root.find('h2, h3, h4').first().text() || $(el).text())
      if (!name || name.length < 2) return

      const img = root.find('img').first()
      const poster = absolutize(
        pageUrl,
        img.attr('src') || img.attr('data-src') || img.attr('data-original') || img.attr('data-lazy')
      )
      const description = sanitizeText(
        root.find('p, .description, .lead, [class*="desc"]').first().text()
      )
      const releaseInfo = sanitizeText(
        root.find('time').attr('datetime') ||
          root.find('time').text() ||
          root.find('[class*="year"], [class*="date"]').first().text()
      )

      items.push({
        name,
        url: canonical,
        poster,
        description,
        releaseInfo,
        genre: ''
      })
    })

    if (items.length >= 250) break
  }

  return items
}

function normalizeType(targetType, row) {
  if (targetType === 'series') return 'series'
  if (targetType === 'movie') return 'movie'

  const bucket = `${row.url || ''} ${row.name || ''} ${row.genre || ''}`.toLowerCase()
  if (bucket.includes('/adatlap/sorozat/') || bucket.includes('sorozat') || bucket.includes('series')) {
    return 'series'
  }
  return 'movie'
}

function toMeta(targetType, row) {
  const canonicalUrl = canonicalizeUrl(row.url) || `urn:porthu:${row.name}`
  const type = normalizeType(targetType, row)
  const name = sanitizeText(row.name)
  if (!name) return null

  return {
    id: makeMetaId(type, canonicalUrl, name),
    type,
    name,
    poster: row.poster || undefined,
    description: row.description || undefined,
    releaseInfo: row.releaseInfo || undefined,
    genres: row.genre ? row.genre.split(',').map((g) => sanitizeText(g)).filter(Boolean) : undefined,
    website: canonicalUrl || undefined
  }
}

function dedupeMetas(metas) {
  const byId = new Map()
  for (const meta of metas) {
    if (!meta) continue
    if (!byId.has(meta.id)) {
      byId.set(meta.id, meta)
      continue
    }

    const prev = byId.get(meta.id)
    byId.set(meta.id, {
      ...prev,
      poster: prev.poster || meta.poster,
      description: prev.description || meta.description,
      releaseInfo: prev.releaseInfo || meta.releaseInfo,
      genres: prev.genres || meta.genres,
      website: prev.website || meta.website
    })
  }

  return [...byId.values()]
}

async function fetchOneCatalogPage(url) {
  const { data } = await http.get(url)
  const $ = cheerio.load(data)
  const jsonLdItems = parseJsonLdBlocks($, url)
  const domItems = parseDomCards($, url)
  return [...jsonLdItems, ...domItems]
}

async function fetchCatalog({ type, genre, skip = 0, limit = 50 }) {
  const urls = CATALOG_URLS[type] || CATALOG_URLS.movie
  const rows = []
  const errors = []

  for (const url of urls) {
    try {
      const part = await fetchOneCatalogPage(url)
      rows.push(...part)
      if (rows.length >= skip + limit + 80) break
    } catch (error) {
      errors.push(`${url}: ${error.message}`)
    }
  }

  const metas = dedupeMetas(rows.map((r) => toMeta(type, r)).filter(Boolean))
    .filter((meta) => {
      if (!genre) return true
      const genreNeedle = genre.toLowerCase()
      return (meta.genres || []).some((g) => g.toLowerCase().includes(genreNeedle))
    })
    .filter((meta) => Boolean(meta.poster))
    .slice(skip, skip + limit)

  for (const meta of metas) {
    META_CACHE.set(meta.id, meta)
  }

  return {
    source: SOURCE_NAME,
    type,
    genre,
    skip,
    limit,
    metas,
    warnings: errors.length ? errors : undefined
  }
}

async function fetchMeta({ type, id }) {
  if (META_CACHE.has(id)) return { meta: META_CACHE.get(id) }

  const movieResult = await fetchCatalog({ type: type || 'movie', limit: 80, skip: 0 })
  const fromMovie = movieResult.metas.find((m) => m.id === id)
  if (fromMovie) return { meta: fromMovie }

  const seriesResult = await fetchCatalog({ type: 'series', limit: 80, skip: 0 })
  const fromSeries = seriesResult.metas.find((m) => m.id === id)
  if (fromSeries) return { meta: fromSeries }

  return { meta: null }
}

module.exports = {
  fetchCatalog,
  fetchMeta,
  fetchOneCatalogPage,
  parseJsonLdBlocks,
  parseDomCards,
  toMeta,
  dedupeMetas,
  SOURCE_NAME
}
