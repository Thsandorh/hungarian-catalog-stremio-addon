const test = require('node:test')
const assert = require('node:assert/strict')

const { _internals } = require('../src/mafabAdapter')

test('mafab catalog source URLs always use www host to avoid redirect loops', () => {
  const catalogs = _internals.CATALOG_SOURCES

  for (const urls of Object.values(catalogs)) {
    for (const url of urls) {
      assert.match(url, /^https:\/\/www\.mafab\.hu\//)
    }
  }
})



test('streaming provider split sources are configured', () => {
  const catalogs = _internals.CATALOG_SOURCES
  assert.equal(catalogs['mafab-streaming-netflix'][0], 'https://www.mafab.hu/vod/top-streaming/netflix')
  assert.equal(catalogs['mafab-streaming-hbo'][0], 'https://www.mafab.hu/vod/top-streaming/hbo')
  assert.equal(catalogs['mafab-streaming-telekom-tvgo'][0], 'https://www.mafab.hu/vod/top-streaming/tvgo')
  assert.equal(catalogs['mafab-streaming-cinego'][0], 'https://www.mafab.hu/vod/top-streaming/cinego')
  assert.equal(catalogs['mafab-streaming-filmio'][0], 'https://www.mafab.hu/vod/top-streaming/filmio')
  assert.equal(catalogs['mafab-streaming-amazon'][0], 'https://www.mafab.hu/vod/top-streaming/amazon')
  assert.equal(catalogs['mafab-streaming-apple-tv'][0], 'https://www.mafab.hu/vod/top-streaming/appletv')
  assert.equal(catalogs['mafab-streaming-disney'][0], 'https://www.mafab.hu/vod/top-streaming/disney')
  assert.equal(catalogs['mafab-streaming-skyshowtime'][0], 'https://www.mafab.hu/vod/top-streaming/skyshowtime')
})

test('dynamic year-based Mafab sources include year window params', () => {
  const catalogs = _internals.CATALOG_SOURCES
  const yearWindow = catalogs['mafab-year-window'][0]
  const bestCurrent = catalogs['mafab-best-current-year'][0]
  const totalGross = catalogs['mafab-total-gross'][0]

  assert.match(yearWindow, /yrf=\d{4}&yrt=\d{4}/)
  assert.match(bestCurrent, /yrf=\d{4}&yrt=\d{4}/)
  assert.match(totalGross, /year_from=\d{4}&year_to=\d{4}/)
})

test('parsePage extracts only catalog presence (url + lookup title)', () => {
  const html = `
    <div class="item">
      <a href="/movies/a-keresztapa-2551.html" title="A keresztapa">A keresztapa</a>
      <p>Should not be scraped as metadata.</p>
      <span>tt0068646</span>
    </div>
  `

  const rows = _internals.parsePage(html, 'https://www.mafab.hu/filmek/filmek/')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].url, 'https://www.mafab.hu/movies/a-keresztapa-2551.html')
  assert.equal(rows[0].lookupTitle, 'A Keresztapa')
  assert.equal(rows[0].seedTitle, 'A keresztapa')
  assert.equal(rows[0].name, 'A Keresztapa')
  assert.equal(rows[0].year, null)
  assert.equal(rows[0].imdbId, null)
  assert.equal(rows[0].description, undefined)
  assert.equal(rows[0].releaseInfo, undefined)
})


test('titleFromDetailUrl drops numeric-only slugs', () => {
  assert.equal(_internals.titleFromDetailUrl('https://www.mafab.hu/movies/623207.html'), '')
})

test('parsePage keeps item when slug is numeric but anchor title is valid', () => {
  const html = `
    <div class="item">
      <a href="/movies/623207.html" title="Nuremberg">Nuremberg</a>
    </div>
  `

  const rows = _internals.parsePage(html, 'https://www.mafab.hu/filmek/filmek/')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].lookupTitle, '')
  assert.equal(rows[0].seedTitle, 'Nuremberg')
  assert.equal(rows[0].name, 'Nuremberg')
})

test('titleFromDetailUrl builds readable title from slug', () => {
  assert.equal(_internals.titleFromDetailUrl('https://www.mafab.hu/movies/the-roses-81432.html'), 'The Roses')
})

test('parseAutocompleteLabel extracts clean label text and year', () => {
  const parsed = _internals.parseAutocompleteLabel('<strong>A keresztapa</strong> (1972) - film')

  assert.equal(parsed.title, 'A keresztapa')
  assert.equal(parsed.year, 1972)
})

test('findBestAutocompleteMatch prefers exact Mafab detail URL match', () => {
  const row = {
    lookupTitle: 'A Keresztapa',
    url: 'https://www.mafab.hu/movies/a-keresztapa-2551.html'
  }

  const best = _internals.findBestAutocompleteMatch([
    { cat: 'movie', label: 'A keresztapa 2 (1974)', id: '/movies/a-keresztapa-2-2597.html' },
    { cat: 'movie', label: 'A keresztapa (1972)', id: '/movies/a-keresztapa-2551.html' }
  ], row)

  assert.equal(best.url, 'https://www.mafab.hu/movies/a-keresztapa-2551.html')
  assert.equal(best.year, 1972)
})

test('normalizeTitle strips noise tokens and trailing year', () => {
  assert.equal(_internals.normalizeTitle('NA Egyél müzlit! (2021)'), 'Egyél müzlit!')
})

test('toMeta uses Cinemeta poster when imdb id exists', () => {
  const meta = _internals.toMeta({
    name: 'The Godfather',
    lookupTitle: 'The Godfather',
    imdbId: 'tt0068646',
    url: 'https://www.mafab.hu/movies/a-keresztapa-2551.html'
  })

  assert.equal(meta.poster, 'https://images.metahub.space/poster/medium/tt0068646/img')
})

test('toMeta falls back to lookupTitle when name is empty', () => {
  const meta = _internals.toMeta({
    name: '',
    lookupTitle: 'The Roses',
    url: 'https://www.mafab.hu/movies/the-roses-81432.html'
  })

  assert.equal(meta.name, 'The Roses')
})

test('toMeta supports series type for Mafab series catalog', () => {
  const meta = _internals.toMeta(
    {
      name: 'Sorsügynökség',
      imdbId: 'tt1234567',
      url: 'https://www.mafab.hu/movies/sorsugynokseg-1.html'
    },
    { type: 'series' }
  )

  assert.equal(meta.type, 'series')
})

test('toMeta uses imdb id as the meta id when available', () => {
  const meta = _internals.toMeta({
    name: 'The Godfather',
    imdbId: 'tt0068646',
    url: 'https://www.mafab.hu/movies/a-keresztapa-2551.html'
  })

  assert.equal(meta.id, 'tt0068646')
})

test('getTmdbApiKey returns configured key fallback', () => {
  assert.equal(_internals.getTmdbApiKey(), process.env.TMDB_API_KEY || process.env.MAFAB_TMDB_API_KEY || 'ffe7ef8916c61835264d2df68276ddc2')
})
