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

function makeMetaId(type, canonicalUrl) {
  const hash = crypto.createHash('sha1').update(canonicalUrl).digest('hex').slice(0, 24)
  return `porthu:${type}:${hash}`
}

function absolutize(baseUrl, maybeRelative) {
  if (!maybeRelative) return null
  try {
    return new URL(maybeRelative, baseUrl).toString()
  } catch {
    return null
  }
}

function sanitizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
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
            genre: sanitizeText(Array.isArray(item.genre) ? item.genre.join(', ') : item.genre),
            _from: 'jsonld:list'
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
          genre: sanitizeText(Array.isArray(entry.genre) ? entry.genre.join(', ') : entry.genre),
          _from: 'jsonld:item'
        })
      }
    }
  }

  return items
}

function parseDomCards($, pageUrl) {
  const items = []
  const cardSelectors = [
    'article a[href]',
    '.card a[href]',
    '.item a[href]',
    '[data-testid*="card"] a[href]',
    'a[href*="/adatlap/film/"]',
    'a[href*="/adatlap/sorozat/"]',
    'a[href*="film"]',
    'a[href*="sorozat"]'
  ]

  for (const sel of cardSelectors) {
    $(sel).each((_, el) => {
      const href = $(el).attr('href')
      const name = sanitizeText($(el).attr('title') || $(el).text())
      if (!href || !name || name.length < 2) return

      const canonical = absolutize(pageUrl, href)
      const root = $(el).closest('article, .card, .item, li, div')
      const img = root.find('img').first()
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
        poster: absolutize(pageUrl, img.attr('src') || img.attr('data-src')),
        description,
        releaseInfo,
        genre: '',
        _from: `dom:${sel}`
      })
    })

    if (items.length >= 150) break
  }

  return items
}

function normalizeType(targetType, row) {
  if (targetType === 'series') return 'series'
  if (targetType === 'movie') return 'movie'

  const bucket = `${row.url || ''} ${row.name || ''} ${row.genre || ''}`.toLowerCase()
  if (bucket.includes('sorozat') || bucket.includes('series')) return 'series'
  return 'movie'
}

function toMeta(targetType, row) {
  const canonicalUrl = row.url || `urn:porthu:${row.name}`
  const type = normalizeType(targetType, row)
  const name = sanitizeText(row.name)
  if (!name) return null

  return {
    id: makeMetaId(type, canonicalUrl),
    type,
    name,
    poster: row.poster || undefined,
    description: row.description || undefined,
    releaseInfo: row.releaseInfo || undefined,
    genres: row.genre ? row.genre.split(',').map((g) => sanitizeText(g)).filter(Boolean) : undefined,
    website: row.url || undefined
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
      if (rows.length >= skip + limit + 20) break
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
    .slice(skip, skip + limit)

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

module.exports = {
  fetchCatalog,
  fetchOneCatalogPage,
  parseJsonLdBlocks,
  parseDomCards,
  toMeta,
  dedupeMetas,
  SOURCE_NAME
}
