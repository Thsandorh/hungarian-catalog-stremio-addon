const crypto = require('node:crypto')
const { URL } = require('node:url')

const axios = require('axios')
const cheerio = require('cheerio')

const SOURCE_NAME = 'port.hu'
const DEFAULT_TIMEOUT_MS = Number(process.env.PORT_HU_HTTP_TIMEOUT_MS || 12000)
const PAGE_CACHE_TTL_MS = Number(process.env.PORT_HU_PAGE_CACHE_TTL_MS || 10 * 60 * 1000)
const CATALOG_CACHE_TTL_MS = Number(process.env.PORT_HU_CATALOG_CACHE_TTL_MS || 5 * 60 * 1000)
const DETAIL_CONCURRENCY = Number(process.env.PORT_HU_DETAIL_CONCURRENCY || 8)

const SOURCE_URLS = ['https://port.hu/film', 'https://port.hu/tv', 'https://port.hu/mozi', 'https://port.hu']

const META_CACHE = new Map()
const DETAIL_CACHE = new Map()
const PAGE_CACHE = new Map()
const CATALOG_CACHE = new Map()

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
    return String(value).split('#')[0].split('?')[0]
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
  const movie = text.match(/movie-([0-9]+)/i)
  if (movie) return `movie-${movie[1]}`
  const episode = text.match(/episode-([0-9]+)/i)
  if (episode) return `episode-${episode[1]}`
  const event = text.match(/event-([0-9]+)/i)
  if (event) return `event-${event[1]}`
  return null
}

function extractImdbId(value) {
  const text = String(value || '')
  const m = text.match(/tt[0-9]{5,10}/i)
  return m ? m[0].toLowerCase() : null
}

function makeMetaId(canonicalUrl, name) {
  const entityId = extractEntityId(canonicalUrl)
  if (entityId) return `porthu:mixed:${entityId}`
  const hash = crypto
    .createHash('sha1')
    .update(`${canonicalUrl || name || ''}`)
    .digest('hex')
    .slice(0, 24)
  return `porthu:mixed:h-${hash}`
}

function isPosterUrl(url) {
  const u = String(url || '')
  if (!u) return false
  if (u.includes('/img/agelimit/')) return false
  return /\.(jpg|jpeg|png|webp)(\?|$)/i.test(u) || u.includes('/images/')
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
  const selectors = ['a[href*="/adatlap/film/"]', 'a[href*="/adatlap/sorozat/"]', 'article a[href]']

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const href = $(el).attr('href')
      const canonical = absolutize(pageUrl, href)
      if (!canonical || !canonical.includes('/adatlap/')) return

      const root = $(el).closest('article, .event-holder, .event-card, .card, .item, li, div')
      const name = sanitizeText(
        $(el).attr('title') ||
          $(el).attr('aria-label') ||
          root.find('h1, h2, h3, h4, .title').first().text() ||
          $(el).text()
      )
      if (!name || name.length < 2) return

      const imgs = root.find('img').toArray().map((node) => $(node))
      let poster = null
      for (const img of imgs) {
        const candidate = absolutize(
          pageUrl,
          img.attr('src') || img.attr('data-src') || img.attr('data-original') || img.attr('data-lazy')
        )
        if (isPosterUrl(candidate)) {
          poster = candidate
          break
        }
      }

      items.push({
        name,
        url: canonical,
        poster,
        description: sanitizeText(root.find('p, .description, .lead, [class*="desc"]').first().text()),
        releaseInfo: sanitizeText(
          root.find('time').attr('datetime') ||
            root.find('time').text() ||
            root.find('[class*="year"], [class*="date"]').first().text()
        ),
        genre: ''
      })
    })

    if (items.length >= 400) break
  }

  return items
}

function toMeta(row) {
  const canonicalUrl = canonicalizeUrl(row.url) || `urn:porthu:${row.name}`
  const name = sanitizeText(row.name)
  if (!name) return null

  const imdbId = extractImdbId(row.imdbId || canonicalUrl)

  return {
    id: imdbId || makeMetaId(canonicalUrl, name),
    type: 'movie',
    name,
    poster: row.poster || undefined,
    description: row.description || undefined,
    releaseInfo: row.releaseInfo || undefined,
    genres: row.genre ? row.genre.split(',').map((g) => sanitizeText(g)).filter(Boolean) : undefined,
    website: canonicalUrl || undefined,
    imdb_id: imdbId || undefined
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
      name: prev.name.length >= meta.name.length ? prev.name : meta.name,
      poster: prev.poster || meta.poster,
      description: prev.description || meta.description,
      releaseInfo: prev.releaseInfo || meta.releaseInfo,
      genres: prev.genres || meta.genres,
      website: prev.website || meta.website,
      imdb_id: prev.imdb_id || meta.imdb_id
    })
  }

  return [...byId.values()]
}

async function fetchDetailHints(detailUrl) {
  const url = canonicalizeUrl(detailUrl)
  if (!url) return {}
  if (DETAIL_CACHE.has(url)) return DETAIL_CACHE.get(url)

  try {
    const { data } = await http.get(url)
    const $ = cheerio.load(data)
    const hint = {
      poster: absolutize(url, $('meta[property="og:image"]').attr('content')),
      description: sanitizeText(
        $('meta[property="og:description"]').attr('content') ||
          $('meta[name="description"]').attr('content')
      ),
      name: sanitizeText($('meta[property="og:title"]').attr('content') || $('h1').first().text()),
      imdbId: extractImdbId(
        $('a[href*="imdb.com/title/tt"]').attr('href') ||
          $('meta[property="og:see_also"]').attr('content') ||
          data
      )
    }
    DETAIL_CACHE.set(url, hint)
    return hint
  } catch {
    const empty = {}
    DETAIL_CACHE.set(url, empty)
    return empty
  }
}

async function runWithConcurrency(items, limit, worker) {
  const queue = [...items]
  const workers = Array.from({ length: Math.max(1, Math.min(limit, queue.length)) }, async () => {
    while (queue.length) {
      const item = queue.shift()
      if (!item) break
      await worker(item)
    }
  })
  await Promise.all(workers)
}

async function enrichRows(rows) {
  const candidates = rows.filter((r) => (!r.poster || !r.imdbId) && r.url).slice(0, 90)

  await runWithConcurrency(candidates, DETAIL_CONCURRENCY, async (row) => {
    const hint = await fetchDetailHints(row.url)
    if (!row.poster && isPosterUrl(hint.poster)) row.poster = hint.poster
    if (!row.description && hint.description) row.description = hint.description
    if ((!row.name || row.name.length < 2) && hint.name) row.name = hint.name
    if (!row.imdbId && hint.imdbId) row.imdbId = hint.imdbId
  })
}

function uniqueRows(rows) {
  const map = new Map()
  for (const row of rows) {
    const key = canonicalizeUrl(row.url) || `${row.name}:${row.poster || ''}`
    if (!map.has(key)) {
      map.set(key, row)
      continue
    }

    const prev = map.get(key)
    map.set(key, {
      ...prev,
      poster: prev.poster || row.poster,
      description: prev.description || row.description,
      releaseInfo: prev.releaseInfo || row.releaseInfo,
      imdbId: prev.imdbId || row.imdbId,
      name: prev.name.length >= row.name.length ? prev.name : row.name
    })
  }

  return [...map.values()]
}

async function fetchOneCatalogPage(url) {
  const now = Date.now()
  const cached = PAGE_CACHE.get(url)
  if (cached && cached.expiresAt > now) return cached.rows

  const { data } = await http.get(url)
  const $ = cheerio.load(data)
  const rows = [...parseJsonLdBlocks($, url), ...parseDomCards($, url)]

  PAGE_CACHE.set(url, { rows, expiresAt: now + PAGE_CACHE_TTL_MS })
  return rows
}

function catalogCacheKey({ genre, skip, limit }) {
  return `${genre || ''}|${skip}|${limit}`
}

async function fetchCatalog({ genre, skip = 0, limit = 50 }) {
  const key = catalogCacheKey({ genre, skip, limit })
  const now = Date.now()
  const cached = CATALOG_CACHE.get(key)
  if (cached && cached.expiresAt > now) return cached.payload

  const errors = []
  const settled = await Promise.allSettled(SOURCE_URLS.map((url) => fetchOneCatalogPage(url)))

  const rows = []
  settled.forEach((result, idx) => {
    if (result.status === 'fulfilled') rows.push(...result.value)
    else errors.push(`${SOURCE_URLS[idx]}: ${result.reason?.message || 'fetch failed'}`)
  })

  const mixedRows = uniqueRows(rows)
  await enrichRows(mixedRows)

  const filtered = dedupeMetas(mixedRows.map((r) => toMeta(r)).filter(Boolean)).filter((meta) => {
    if (!genre) return true
    const genreNeedle = genre.toLowerCase()
    return (meta.genres || []).some((g) => g.toLowerCase().includes(genreNeedle))
  })

  const withPoster = filtered.filter((m) => Boolean(m.poster))
  const withoutPoster = filtered.filter((m) => !m.poster)
  const metas = [...withPoster, ...withoutPoster].slice(skip, skip + limit)

  metas.forEach((meta) => META_CACHE.set(meta.id, meta))

  const payload = {
    source: SOURCE_NAME,
    type: 'movie',
    genre,
    skip,
    limit,
    metas,
    warnings: errors.length ? errors : undefined
  }

  CATALOG_CACHE.set(key, { payload, expiresAt: now + CATALOG_CACHE_TTL_MS })
  return payload
}

async function fetchMeta({ id }) {
  if (META_CACHE.has(id)) return { meta: META_CACHE.get(id) }

  const catalog = await fetchCatalog({ limit: 300, skip: 0 })
  const match = catalog.metas.find((m) => m.id === id)
  return { meta: match || null }
}

async function fetchStreams({ id }) {
  const { meta } = await fetchMeta({ id })
  if (!meta?.website) return { streams: [] }

  return {
    streams: [
      {
        name: 'Port.hu',
        title: 'Open on Port.hu',
        externalUrl: meta.website
      }
    ]
  }
}

module.exports = {
  fetchCatalog,
  fetchMeta,
  fetchStreams,
  fetchOneCatalogPage,
  parseJsonLdBlocks,
  parseDomCards,
  toMeta,
  dedupeMetas,
  SOURCE_NAME
}
