const axios = require('axios')
const cheerio = require('cheerio')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

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

const execFileAsync = promisify(execFile)

async function fetchMafabText(url, { params = null, useAjaxHeaders = false } = {}) {
  const args = ['-sL', '--max-time', String(Math.ceil(Number(process.env.MAFAB_HTTP_TIMEOUT_MS || 12000) / 1000) || 12)]
  args.push('-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')
  args.push('-H', 'Accept-Language: hu-HU,hu;q=0.9,en;q=0.8')
  if (useAjaxHeaders) {
    args.push('-H', 'Referer: https://www.mafab.hu/')
    args.push('-H', 'X-Requested-With: XMLHttpRequest')
  }

  if (params && Object.keys(params).length) {
    args.push('--get', url)
    for (const [key, value] of Object.entries(params)) {
      args.push('--data-urlencode', `${key}=${value == null ? '' : String(value)}`)
    }
  } else {
    args.push(url)
  }

  const { stdout } = await execFileAsync('curl', args, { maxBuffer: 8 * 1024 * 1024 })
  return String(stdout || '')
}

const http = axios.create({
  timeout: Number(process.env.MAFAB_HTTP_TIMEOUT_MS || 12000),
  headers: {
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'hu-HU,hu;q=0.9,en;q=0.8'
  },
  maxRedirects: 8,
  validateStatus: (s) => s >= 200 && s < 400
})

function sanitizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeForMatch(value) {
  return sanitizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function hasLetters(value) {
  return /\p{L}{2,}/u.test(sanitizeText(value))
}

function normalizeTitle(value) {
  return sanitizeText(value)
    .replace(/^\d{1,3}\s+(?=\p{L}|\d)/u, '')
    .replace(/^\d{1,3}%\s+(?=\p{L}|\d)/u, '')
    .replace(/^(?:n\/?a|na)\s+(?=\p{L}|\d)/iu, '')
    .replace(/\s*\((19\d{2}|20\d{2})\)\s*$/u, '')
    .replace(/\.{3}$/, '')
    .trim()
}

function extractYear(value) {
  const m = String(value || '').match(/(?:\(|\b)(19\d{2}|20\d{2})(?:\)|\b)/)
  return m ? Number(m[1]) : null
}

function stripHtml(value) {
  return sanitizeText(String(value || '').replace(/<[^>]+>/g, ' '))
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

function titleFromDetailUrl(url) {
  const m = String(url || '').match(/\/movies\/([^/?#]+)\.html/i)
  if (!m) return ''

  const rawSlug = m[1].replace(/-{1,2}\d+$/u, '')
  const cleanSlug = sanitizeText(rawSlug.replace(/[-_]+/g, ' '))
  if (!hasLetters(cleanSlug)) return ''

  const words = cleanSlug.split(' ')
  return words.map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
}

function toDetailSlug(url) {
  const m = String(url || '').match(/\/movies\/([^/?#]+\.html)/i)
  return m ? m[1].toLowerCase() : ''
}

function parseAutocompleteLabel(label) {
  const clean = stripHtml(label)
  const year = extractYear(clean)
  const title = normalizeTitle(clean.replace(/\s*[-–—]\s*.*$/, '').replace(/\s*\((19\d{2}|20\d{2})\).*$/, ''))
  return { title: title || clean, year }
}

function parseAutocompletePayload(payload) {
  if (Array.isArray(payload)) return payload
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function findBestAutocompleteMatch(items, row) {
  const entries = Array.isArray(items) ? items : []
  if (!entries.length) return null

  const targetSlug = toDetailSlug(row?.url)
  const targetTitle = normalizeForMatch(row?.lookupTitle || row?.name)

  const scored = entries
    .map((item) => {
      const url = absolutize('https://www.mafab.hu', item?.id || item?.url || item?.value)
      const cat = String(item?.cat || '').toLowerCase()
      const parsed = parseAutocompleteLabel(item?.label || item?.value || '')
      const titleNorm = normalizeForMatch(parsed.title)
      const slug = toDetailSlug(url)
      let score = 0

      if (cat === 'movie' || cat === 'series' || cat === 'tv') score += 10
      if (targetSlug && slug && targetSlug === slug) score += 300
      if (targetTitle && titleNorm && targetTitle === titleNorm) score += 120
      if (targetTitle && titleNorm && (titleNorm.includes(targetTitle) || targetTitle.includes(titleNorm))) score += 40
      if (parsed.year) score += 5

      return {
        score,
        title: parsed.title,
        year: parsed.year,
        url
      }
    })
    .sort((a, b) => b.score - a.score)

  return scored[0]?.score > 0 ? scored[0] : null
}

function getTmdbApiKey() {
  return process.env.TMDB_API_KEY || process.env.MAFAB_TMDB_API_KEY || DEFAULT_TMDB_API_KEY
}

async function searchAutocomplete(term) {
  const query = sanitizeText(term)
  if (!query) return []
  const key = query.toLowerCase()
  if (AUTOCOMPLETE_CACHE.has(key)) return AUTOCOMPLETE_CACHE.get(key)

  try {
    const raw = await fetchMafabText(AUTOCOMPLETE_ENDPOINT, {
      params: { term: query, v: 21 },
      useAjaxHeaders: true
    })

    const parsed = parseAutocompletePayload(raw)
    AUTOCOMPLETE_CACHE.set(key, parsed)
    return parsed
  } catch {
    AUTOCOMPLETE_CACHE.set(key, [])
    return []
  }
}

function getTmdbResultTitle(item, mediaType) {
  return mediaType === 'tv' ? sanitizeText(item?.name || item?.original_name) : sanitizeText(item?.title || item?.original_title)
}

function getTmdbResultYear(item, mediaType) {
  const date = mediaType === 'tv' ? item?.first_air_date : item?.release_date
  return extractYear(date)
}

async function searchTmdbImdbId({ title, year, type }) {
  const cleanTitle = normalizeTitle(title)
  const apiKey = getTmdbApiKey()
  if (!cleanTitle || !apiKey) return null

  const mediaType = type === 'series' ? 'tv' : 'movie'
  const cacheKey = `${mediaType}:${cleanTitle.toLowerCase()}:${year || ''}`
  if (TMDB_CACHE.has(cacheKey)) return TMDB_CACHE.get(cacheKey)

  try {
    const searchPath = mediaType === 'tv' ? '/search/tv' : '/search/movie'
    const params = {
      api_key: apiKey,
      query: cleanTitle,
      language: 'hu-HU',
      include_adult: false
    }
    if (year) {
      if (mediaType === 'tv') params.first_air_date_year = year
      else params.year = year
    }

    const searchRes = await http.get(`${TMDB_BASE_URL}${searchPath}`, { params })
    const candidates = Array.isArray(searchRes.data?.results) ? searchRes.data.results.slice(0, 10) : []
    if (!candidates.length) {
      TMDB_CACHE.set(cacheKey, null)
      return null
    }

    const scored = candidates
      .map((item) => {
        const itemTitleNorm = normalizeForMatch(getTmdbResultTitle(item, mediaType))
        const targetNorm = normalizeForMatch(cleanTitle)
        const itemYear = getTmdbResultYear(item, mediaType)
        let score = 0
        if (itemTitleNorm && targetNorm && itemTitleNorm === targetNorm) score += 100
        if (itemTitleNorm && targetNorm && (itemTitleNorm.includes(targetNorm) || targetNorm.includes(itemTitleNorm))) score += 30
        if (year && itemYear === year) score += 40
        if (!year && itemYear) score += 5
        return { score, id: item.id }
      })
      .sort((a, b) => b.score - a.score)

    for (const candidate of scored) {
      const externalPath = mediaType === 'tv' ? `/tv/${candidate.id}/external_ids` : `/movie/${candidate.id}/external_ids`
      const externalRes = await http.get(`${TMDB_BASE_URL}${externalPath}`, { params: { api_key: apiKey } })
      const imdbId = extractImdbId(externalRes.data?.imdb_id)
      if (imdbId) {
        TMDB_CACHE.set(cacheKey, imdbId)
        return imdbId
      }
    }

    TMDB_CACHE.set(cacheKey, null)
    return null
  } catch {
    TMDB_CACHE.set(cacheKey, null)
    return null
  }
}

function parsePage(html, pageUrl) {
  const $ = cheerio.load(html)
  const rows = []
  const seen = new Set()

  $('a[href*="/movies/"]').each((_, el) => {
    const detailUrl = absolutize(pageUrl, $(el).attr('href'))
    if (!detailUrl || seen.has(detailUrl)) return
    seen.add(detailUrl)

    const anchorTitle = normalizeTitle($(el).attr('title') || $(el).attr('aria-label') || $(el).text())
    const lookupTitle = titleFromDetailUrl(detailUrl)
    const seedTitle = hasLetters(anchorTitle) ? anchorTitle : lookupTitle
    if (!seedTitle) return

    rows.push({
      url: detailUrl,
      lookupTitle,
      seedTitle,
      name: lookupTitle || seedTitle,
      year: null,
      imdbId: null
    })
  })

  return rows
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
      const queryTitle = row.seedTitle || row.lookupTitle || row.name
      const autocompleteItems = await searchAutocomplete(queryTitle)
      const best = findBestAutocompleteMatch(autocompleteItems, row)

      if (best?.title) row.name = normalizeTitle(best.title)
      else if (!hasLetters(row.name)) row.name = normalizeTitle(row.seedTitle || row.lookupTitle)

      if (best?.year) row.year = best.year
      if (best?.url) row.url = best.url

      const tmdbTitles = [row.name, row.seedTitle, row.lookupTitle].map((v) => normalizeTitle(v)).filter((v, i, a) => v && a.indexOf(v) === i)
      for (const tmdbTitle of tmdbTitles) {
        const imdbId = await searchTmdbImdbId({
          title: tmdbTitle,
          year: row.year || null,
          type
        })
        if (imdbId) {
          row.imdbId = imdbId
          break
        }
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
    name: normalizeTitle(row.name) || normalizeTitle(row.seedTitle) || normalizeTitle(row.lookupTitle) || 'Ismeretlen cím',
    poster,
    releaseInfo: row.year ? String(row.year) : undefined,
    imdb_id: imdbId || undefined,
    website: row.url || undefined
  }
}

function dedupeMetasByName(metas) {
  const map = new Map()
  for (const m of metas) {
    const norm = normalizeForMatch(m.name)
    if (!norm) continue
    if (!map.has(norm)) {
      map.set(norm, m)
      continue
    }

    const prev = map.get(norm)
    const prevScore = (prev.imdb_id ? 2 : 0) + (prev.poster ? 1 : 0)
    const currScore = (m.imdb_id ? 2 : 0) + (m.poster ? 1 : 0)
    map.set(norm, currScore > prevScore ? m : prev)
  }
  return [...map.values()]
}

async function fetchCatalog({ type = 'movie', catalogId = 'hu-mixed', genre, skip = 0, limit = 50 }) {
  if (catalogId.startsWith('porthu-')) return { source: SOURCE_NAME, metas: [] }
  const urls = CATALOG_SOURCES[catalogId] || SOURCE_URLS

  const settled = await Promise.allSettled(urls.map(async (u) => ({ data: await fetchMafabText(u) })))
  const rows = []
  const warnings = []

  for (let i = 0; i < settled.length; i += 1) {
    const item = settled[i]
    if (item.status === 'fulfilled') rows.push(...parsePage(item.value.data, urls[i]))
    else warnings.push(`${urls[i]}: ${item.reason?.message || 'failed'}`)
  }

  const uniqueRows = [...new Map(rows.map((r) => [r.url, r])).values()]
  const metaType = catalogId === 'mafab-series' || catalogId === 'mafab-series-lists' || catalogId === 'mafab-tv' || type === 'series' ? 'series' : 'movie'

  const enrichedRows = await enrichRows(uniqueRows, {
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
    metas = metas.filter((m) => (m.name || '').toLowerCase().includes(g))
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
    titleFromDetailUrl,
    normalizeTitle,
    hasLetters,
    getTmdbApiKey,
    toMeta
  }
}
