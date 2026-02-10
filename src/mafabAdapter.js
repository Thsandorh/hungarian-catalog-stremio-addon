const axios = require('axios')
const cheerio = require('cheerio')

const SOURCE_NAME = 'mafab.hu'
const CATALOG_SOURCES = {
  'mafab-movies': ['https://www.mafab.hu/filmek/filmek/'],
  'mafab-series': ['https://www.mafab.hu/sorozatok/sorozatok/'],
  'mafab-streaming': ['https://www.mafab.hu/vod/top-streaming'],
  'mafab-cinema': ['https://www.mafab.hu/cinema/premier/jelenleg-a-mozikban'],
  'mafab-cinema-soon': ['https://www.mafab.hu/cinema/premier/hamarosan-a-mozikban'],
  'mafab-tv': ['https://www.mafab.hu/tv/tv_kinalat'],
  'mafab-movies-lists': ['https://www.mafab.hu/filmek/listak/'],
  'mafab-series-lists': ['https://www.mafab.hu/sorozatok/listak/'],
  'mafab-streaming-premieres': ['https://www.mafab.hu/vod/streaming-premierek'],
  'hu-mixed': [
    'https://www.mafab.hu/filmek/filmek/',
    'https://www.mafab.hu/sorozatok/sorozatok/',
    'https://www.mafab.hu/vod/top-streaming',
    'https://www.mafab.hu/cinema/premier/jelenleg-a-mozikban',
    'https://www.mafab.hu/cinema/premier/hamarosan-a-mozikban',
    'https://www.mafab.hu/tv/tv_kinalat',
    'https://www.mafab.hu/filmek/listak/',
    'https://www.mafab.hu/sorozatok/listak/',
    'https://www.mafab.hu/vod/streaming-premierek'
  ]
}

const SOURCE_URLS = CATALOG_SOURCES['hu-mixed']
const AUTOCOMPLETE_ENDPOINT = 'https://www.mafab.hu/js/autocomplete.php'
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const DEFAULT_TMDB_API_KEY = 'ffe7ef8916c61835264d2df68276ddc2'

const META_CACHE = new Map()
const AUTOCOMPLETE_CACHE = new Map()
const TMDB_CACHE = new Map()

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

function normalizeForMatch(value) {
  return sanitizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function stripHtml(value) {
  return sanitizeText(String(value || '').replace(/<[^>]+>/g, ' '))
}

function extractYear(value) {
  const match = String(value || '').match(/(?:\(|\b)(19\d{2}|20\d{2})(?:\)|\b)/)
  return match ? Number(match[1]) : null
}

function parseAutocompleteLabel(label) {
  const clean = stripHtml(label)
  const year = extractYear(clean)
  const title = sanitizeText(clean.replace(/\s*[\[(](19\d{2}|20\d{2})[\])].*$/, '').replace(/\s+-\s+.*$/, ''))
  return { title: title || clean, year }
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

function toDetailSlug(url) {
  const match = String(url || '').match(/\/movies\/([^/?#]+\.html)/i)
  return match ? match[1].toLowerCase() : ''
}

function findBestAutocompleteMatch(items, row) {
  const entries = Array.isArray(items) ? items : []
  if (!entries.length) return null

  const rowTitleNorm = normalizeForMatch(row?.name)
  const rowSlug = toDetailSlug(row?.url)

  const scored = entries
    .map((item) => {
      const url = absolutize('https://www.mafab.hu', item?.url || item?.value || item?.link)
      const parsed = parseAutocompleteLabel(item?.label || item?.name || item?.title || '')
      const titleNorm = normalizeForMatch(parsed.title)
      const slug = toDetailSlug(url)
      const year = parsed.year || extractYear(item?.year)

      let score = 0
      if (url && rowSlug && slug && slug === rowSlug) score += 200
      if (titleNorm && rowTitleNorm && titleNorm === rowTitleNorm) score += 120
      if (titleNorm && rowTitleNorm && (titleNorm.includes(rowTitleNorm) || rowTitleNorm.includes(titleNorm))) score += 40
      if (year && String(row?.releaseInfo || '').includes(String(year))) score += 20

      return { score, url, title: parsed.title, year }
    })
    .sort((a, b) => b.score - a.score)

  if (!scored.length || scored[0].score <= 0) return null
  return scored[0]
}

function getTmdbApiKey() {
  return process.env.TMDB_API_KEY || process.env.MAFAB_TMDB_API_KEY || DEFAULT_TMDB_API_KEY
}

async function searchAutocomplete(rowName) {
  const term = sanitizeText(rowName)
  if (!term) return []
  const cacheKey = term.toLowerCase()
  if (AUTOCOMPLETE_CACHE.has(cacheKey)) return AUTOCOMPLETE_CACHE.get(cacheKey)

  try {
    const res = await http.get(AUTOCOMPLETE_ENDPOINT, { params: { term } })
    const items = Array.isArray(res.data) ? res.data : []
    AUTOCOMPLETE_CACHE.set(cacheKey, items)
    return items
  } catch {
    AUTOCOMPLETE_CACHE.set(cacheKey, [])
    return []
  }
}

async function searchTmdbImdbId({ title, year, type }) {
  const apiKey = getTmdbApiKey()
  const cleanTitle = sanitizeText(title)
  if (!apiKey || !cleanTitle) return null

  const mediaType = type === 'series' ? 'tv' : 'movie'
  const cacheKey = `${mediaType}:${cleanTitle.toLowerCase()}:${year || ''}`
  if (TMDB_CACHE.has(cacheKey)) return TMDB_CACHE.get(cacheKey)

  try {
    const searchPath = mediaType === 'tv' ? '/search/tv' : '/search/movie'
    const searchParams = { api_key: apiKey, query: cleanTitle }
    if (year) {
      if (mediaType === 'tv') searchParams.first_air_date_year = year
      else searchParams.year = year
    }

    const searchRes = await http.get(`${TMDB_BASE_URL}${searchPath}`, { params: searchParams })
    const candidate = Array.isArray(searchRes.data?.results) ? searchRes.data.results[0] : null
    if (!candidate?.id) {
      TMDB_CACHE.set(cacheKey, null)
      return null
    }

    const externalIdsPath = mediaType === 'tv' ? `/tv/${candidate.id}/external_ids` : `/movie/${candidate.id}/external_ids`
    const externalRes = await http.get(`${TMDB_BASE_URL}${externalIdsPath}`, { params: { api_key: apiKey } })
    const imdbId = extractImdbId(externalRes.data?.imdb_id)
    TMDB_CACHE.set(cacheKey, imdbId || null)
    return imdbId || null
  } catch {
    TMDB_CACHE.set(cacheKey, null)
    return null
  }
}

function parsePage(html, url) {
  const $ = cheerio.load(html)
  const rows = []

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

    rows.push({
      name: title,
      url: detail,
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
      description: prev.description || row.description,
      releaseInfo: prev.releaseInfo || row.releaseInfo,
      imdbId: prev.imdbId || row.imdbId
    })
  }
  return [...map.values()]
}

async function enrichRows(rows, { type = 'movie', maxItems = 30, concurrency = 4 } = {}) {
  const out = [...rows]
  let idx = 0

  async function worker() {
    while (idx < out.length) {
      const current = idx
      idx += 1
      if (current >= maxItems) break

      const row = out[current]
      const shouldEnrich = !row.imdbId || !row.releaseInfo
      if (!shouldEnrich) continue

      const autocompleteItems = await searchAutocomplete(row.name)
      const best = findBestAutocompleteMatch(autocompleteItems, row)
      if (best?.title) row.name = best.title
      if (best?.year && !row.releaseInfo) row.releaseInfo = String(best.year)
      if (best?.url) row.url = best.url

      if (!row.imdbId) {
        const year = extractYear(row.releaseInfo) || best?.year || null
        row.imdbId = await searchTmdbImdbId({ title: row.name, year, type })
      }
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

function toMeta(row, { type = 'movie' } = {}) {
  const imdbId = row.imdbId || extractImdbId(row.url)
  const id = toId(row.url, imdbId)
  const poster = imdbId ? `https://images.metahub.space/poster/medium/${imdbId}/img` : undefined
  return {
    id,
    type,
    name: normalizeTitle(row.name),
    poster,
    description: row.description || undefined,
    releaseInfo: row.releaseInfo || undefined,
    imdb_id: imdbId || undefined,
    website: row.url || undefined
  }
}

function dedupeMetasByName(metas) {
  const map = new Map()
  for (const m of metas) {
    const norm = (m.name || '').toLowerCase().replace(/\s*\(\d{4}\)\s*$/, '').trim()
    if (!norm) continue
    if (!map.has(norm)) {
      map.set(norm, m)
      continue
    }
    const prev = map.get(norm)
    const prevScore = (prev.description ? 1 : 0) + (prev.imdb_id ? 1 : 0)
    const currScore = (m.description ? 1 : 0) + (m.imdb_id ? 1 : 0)
    map.set(norm, {
      ...(currScore > prevScore ? m : prev),
      poster: prev.poster || m.poster,
      description: prev.description || m.description,
      imdb_id: prev.imdb_id || m.imdb_id,
      website: prev.website || m.website
    })
  }
  return [...map.values()]
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

  const metaType = catalogId === 'mafab-series' || catalogId === 'mafab-series-lists' || catalogId === 'mafab-tv' || type === 'series' ? 'series' : 'movie'

  const enrichedRows = await enrichRows(dedupe(rows), {
    type: metaType,
    maxItems: Number(process.env.MAFAB_ENRICH_MAX || 200),
    concurrency: Number(process.env.MAFAB_ENRICH_CONCURRENCY || 8)
  })

  let metas = enrichedRows.map((row) => toMeta(row, { type: metaType }))

  metas = metas.filter((m) => Boolean(m.name))
  metas = dedupeMetasByName(metas)

  const withPoster = metas.filter((m) => Boolean(m.poster))
  const withoutPoster = metas.filter((m) => !m.poster)
  metas = [...withPoster, ...withoutPoster]

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
  const meta = c.metas.find((m) => m.id === id) || null
  return { meta }
}

async function fetchStreams({ type, id, config }) {
  if (config?.features?.externalLinks === false) return { streams: [] }
  const { meta } = await fetchMeta({ id })
  if (!meta?.website) return { streams: [] }
  if (type && meta.type && type !== meta.type) return { streams: [] }
  return {
    streams: [
      {
        name: 'Mafab',
        title: 'Open on Mafab',
        externalUrl: meta.website
      },
      {
        name: 'Support',
        title: 'Buy me a coffee on Ko-fi',
        externalUrl: 'https://ko-fi.com/sandortoth'
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
    parsePage,
    parseAutocompleteLabel,
    findBestAutocompleteMatch,
    getTmdbApiKey,
    toMeta
  }
}
