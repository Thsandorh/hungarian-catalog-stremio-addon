const axios = require('axios')
const cheerio = require('cheerio')

const SOURCE_NAME = 'mafab.hu'
const CATALOG_SOURCES = {
  'mafab-movies': ['https://www.mafab.hu/filmek/filmek/'],
  'mafab-series': ['https://www.mafab.hu/sorozatok/sorozatok/'],
  'mafab-streaming': ['https://www.mafab.hu/vod/top-streaming'],
  'mafab-cinema': ['https://www.mafab.hu/cinema/premier/jelenleg-a-mozikban'],
  'hu-mixed': [
    'https://www.mafab.hu/filmek/filmek/',
    'https://www.mafab.hu/sorozatok/sorozatok/',
    'https://www.mafab.hu/vod/top-streaming',
    'https://www.mafab.hu/cinema/premier/jelenleg-a-mozikban'
  ]
}

const SOURCE_URLS = CATALOG_SOURCES['hu-mixed']

const META_CACHE = new Map()
const DETAIL_HINTS_CACHE = new Map()

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

function normalizeTitle(value) {
  const text = sanitizeText(value)
  if (!text) return text
  return text
    .replace(/^\d{1,3}\s+(?=\p{L}|\d)/u, '')
    .replace(/^\d{1,3}%\s+(?=\p{L}|\d)/u, '')
    .trim()
}

function hasUsefulDescription(value) {
  const text = sanitizeText(value)
  if (!text) return false
  if (text.length < 40) return false
  return /\p{L}{3,}/u.test(text)
}

function absolutize(base, href) {
  if (!href) return null
  try {
    return new URL(href, base).toString().split('#')[0]
  } catch {
    return null
  }
}

function extractUrlFromStyle(styleValue) {
  const m = String(styleValue || '').match(/background-image\s*:\s*url\((['"]?)([^)'"\s]+)\1\)/i)
  return m ? m[2] : null
}

function pickBestSrcFromSrcset(srcset) {
  const candidates = String(srcset || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [url, size = '0w'] = part.split(/\s+/)
      const score = Number(String(size).replace(/[^0-9]/g, '')) || 0
      return { url, score }
    })
    .sort((a, b) => b.score - a.score)
  return candidates[0]?.url || null
}

function upscalePosterUrl(posterUrl) {
  const url = String(posterUrl || '')
  if (!url) return null
  const m = url.match(/\/static\/thumb\/w(\d+)\//i)
  if (!m) return url

  const width = Number(m[1] || 0)
  if (!Number.isFinite(width) || width <= 0) return url
  if (width >= 500) return url

  return url.replace(/\/static\/thumb\/w\d+\//i, '/static/thumb/w500/')
}

function extractPosterFromRoot($, root, pageUrl) {
  const candidates = []

  root.find('img').each((_, img) => {
    const el = $(img)
    candidates.push(el.attr('data-original'))
    candidates.push(el.attr('data-src'))
    candidates.push(pickBestSrcFromSrcset(el.attr('data-srcset')))
    candidates.push(el.attr('src'))
    candidates.push(pickBestSrcFromSrcset(el.attr('srcset')))
  })

  root.find('[data-src]').each((_, el) => candidates.push($(el).attr('data-src')))
  root.find('[style*="background-image"]').each((_, el) => candidates.push(extractUrlFromStyle($(el).attr('style'))))

  const resolved = candidates
    .map((v) => absolutize(pageUrl, v))
    .filter(Boolean)
    .filter((v) => /\.(jpe?g|png|webp)(\?|$)/i.test(v))
    .filter((v) => !/logo|icon|sprite|ajax-loader/i.test(v))

  const prioritized = resolved.sort((a, b) => {
    const sa = /\/static\/thumb\/|\/profiles\//i.test(a) ? 1 : 0
    const sb = /\/static\/thumb\/|\/profiles\//i.test(b) ? 1 : 0
    return sb - sa
  })

  return upscalePosterUrl(prioritized[0] || null)
}

function extractImdbId(value) {
  const m = String(value || '').match(/tt[0-9]{5,10}/i)
  return m ? m[0].toLowerCase() : null
}

function parseDetailHints(html, pageUrl) {
  const $ = cheerio.load(html)
  const ogImage =
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content') ||
    null
  const ogDescription =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    null
  const ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text() || null
  const imdbLink =
    $('a[href*="imdb.com/title/"]').first().attr('href') ||
    String(html || '').match(/imdb\.com\/title\/(tt[0-9]{5,10})/i)?.[0] ||
    null

  return {
    poster: upscalePosterUrl(absolutize(pageUrl, ogImage)),
    description: sanitizeText(ogDescription),
    name: sanitizeText(ogTitle),
    imdbId: extractImdbId(imdbLink || html)
  }
}

function posterQualityScore(url) {
  const value = String(url || '')
  if (!value) return 0
  let score = 1
  if (/\/static\/[^?]*\.(jpe?g|png|webp)(\?|$)/i.test(value)) score += 1
  if (/\/static\/thumb\//i.test(value)) score -= 1
  if (/\/static\/profiles\//i.test(value)) score += 3
  if (/\/static\/thumb\/w\d+\/[0-9]{4}t\//i.test(value)) score -= 2
  return score
}

async function fetchDetailHints(detailUrl) {
  if (!detailUrl) return null
  if (DETAIL_HINTS_CACHE.has(detailUrl)) return DETAIL_HINTS_CACHE.get(detailUrl)

  try {
    const res = await http.get(detailUrl)
    const hints = parseDetailHints(res.data, detailUrl)
    DETAIL_HINTS_CACHE.set(detailUrl, hints)
    return hints
  } catch {
    DETAIL_HINTS_CACHE.set(detailUrl, null)
    return null
  }
}

async function enrichRows(rows, { maxItems = 30, concurrency = 4 } = {}) {
  const out = [...rows]
  let idx = 0

  async function worker() {
    while (idx < out.length) {
      const current = idx
      idx += 1
      if (current >= maxItems) break

      const row = out[current]
      const shouldEnrich = !row.imdbId || !hasUsefulDescription(row.description)
      if (!shouldEnrich || !row.url) continue

      const hints = await fetchDetailHints(row.url)
      if (!hints) continue

      if (hints.poster && posterQualityScore(hints.poster) > posterQualityScore(row.poster)) {
        row.poster = hints.poster
      }
      if (!row.imdbId && hints.imdbId) row.imdbId = hints.imdbId
      if (!hasUsefulDescription(row.description) && hints.description) row.description = hints.description
      if (hints.name && (!row.name || row.name.length < 2)) row.name = hints.name
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker())
  await Promise.allSettled(workers)
  return out
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
  const posterByDetailUrl = new Map()

  $('a[href*="/movies/"]').each((_, el) => {
    const href = $(el).attr('href')
    const detail = absolutize(url, href)
    if (!detail) return
    const root = $(el).closest('.item, article, .card, .movie-box, li, div')
    const itemRoot = root.closest('.item').length ? root.closest('.item') : root
    const poster = extractPosterFromRoot($, itemRoot, url)
    if (poster) posterByDetailUrl.set(detail, poster)
  })

  $('a[href*="/movies/"]').each((_, el) => {
    const href = $(el).attr('href')
    const detail = absolutize(url, href)
    if (!detail) return

    const root = $(el).closest('.item, article, .card, .movie-box, li, div')
    const itemRoot = root.closest('.item').length ? root.closest('.item') : root
    const title = normalizeTitle(
      $(el).attr('title') || $(el).attr('aria-label') || itemRoot.find('h1,h2,h3,h4,.title').first().text() || $(el).text()
    )
    if (!title || title.length < 2) return

    const poster = extractPosterFromRoot($, itemRoot, url) || posterByDetailUrl.get(detail) || null

    rows.push({
      name: title,
      url: detail,
      poster,
      description: sanitizeText(itemRoot.find('p,.description,.lead').first().text()),
      releaseInfo: sanitizeText(itemRoot.find('time').attr('datetime') || itemRoot.find('time').text()),
      imdbId: extractImdbId(itemRoot.text())
    })
  })

  return rows
}

function dedupe(rows) {
  const map = new Map()
  for (const row of rows) {
    const key = row.url
    if (!map.has(key)) {
      map.set(key, row)
      continue
    }

    const prev = map.get(key)
    map.set(key, {
      ...prev,
      name: prev.name || row.name,
      poster: prev.poster || row.poster,
      description: prev.description || row.description,
      releaseInfo: prev.releaseInfo || row.releaseInfo,
      imdbId: prev.imdbId || row.imdbId
    })
  }
  return [...map.values()]
}

function toMeta(row, { type = 'movie' } = {}) {
  const imdbId = row.imdbId || extractImdbId(row.url)
  const id = toId(row.url, imdbId)
  const cinemetaPoster = imdbId ? `https://images.metahub.space/poster/medium/${imdbId}/img` : null
  return {
    id,
    type,
    name: normalizeTitle(row.name),
    poster: cinemetaPoster || row.poster || undefined,
    description: row.description || undefined,
    releaseInfo: row.releaseInfo || undefined,
    imdb_id: imdbId || undefined,
    website: row.url || undefined
  }
}

async function fetchCatalog({ type = 'movie', catalogId = 'hu-mixed', genre, skip = 0, limit = 50 }) {
  if (catalogId.startsWith('porthu-')) return { source: SOURCE_NAME, metas: [] }
  const urls = CATALOG_SOURCES[catalogId] || SOURCE_URLS
  const settled = await Promise.allSettled(urls.map(async (u) => {
    try {
      return await http.get(u)
    } catch (error) {
      if (/redirects exceeded/i.test(String(error?.message || '')) && !u.includes('://www.')) {
        return http.get(u.replace('://mafab.hu/', '://www.mafab.hu/'))
      }
      throw error
    }
  }))
  const rows = []
  const warnings = []

  for (let i = 0; i < settled.length; i += 1) {
    const item = settled[i]
    if (item.status === 'fulfilled') {
      rows.push(...parsePage(item.value.data, urls[i]))
    } else {
      warnings.push(`${urls[i]}: ${item.reason?.message || 'failed'}`)
    }
  }

  const enrichedRows = await enrichRows(dedupe(rows), {
    maxItems: Number(process.env.MAFAB_ENRICH_MAX || 30),
    concurrency: Number(process.env.MAFAB_ENRICH_CONCURRENCY || 4)
  })

  const metaType = catalogId === 'mafab-series' || type === 'series' ? 'series' : 'movie'
  let metas = enrichedRows.map((row) => toMeta(row, { type: metaType }))
  metas = metas.filter((m) => Boolean(m.poster) && Boolean(m.website))
  metas = metas.sort((a, b) => {
    const ap = a.poster ? 1 : 0
    const bp = b.poster ? 1 : 0
    return bp - ap
  })
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
  SOURCE_NAME,
  _internals: {
    CATALOG_SOURCES,
    extractPosterFromRoot,
    upscalePosterUrl,
    parsePage,
    parseDetailHints,
    posterQualityScore,
    toMeta
  }
}
