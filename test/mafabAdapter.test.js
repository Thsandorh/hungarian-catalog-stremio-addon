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

test('parsePage extracts title and url from movie link', () => {
  const html = `
    <div class="item">
      <div class="title"><a href="/movies/a-keresztapa-2551.html" title="A keresztapa">A keresztapa</a></div>
    </div>
  `

  const rows = _internals.parsePage(html, 'https://www.mafab.hu/filmek/filmek/')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'A keresztapa')
  assert.equal(rows[0].url, 'https://www.mafab.hu/movies/a-keresztapa-2551.html')
})

test('parsePage does not extract poster fields', () => {
  const html = `
    <div class="item">
      <div class="image lazyNbg" data-src="/static/thumb/w150/profiles/2016/66/20/2551.jpg"></div>
      <div class="title"><a href="/movies/a-keresztapa-2551.html" title="A keresztapa">A keresztapa</a></div>
    </div>
  `

  const rows = _internals.parsePage(html, 'https://www.mafab.hu/filmek/filmek/')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].poster, undefined)
})

test('parsePage extracts imdb id from item text', () => {
  const html = `
    <div class="item">
      <a href="/movies/a-keresztapa-2551.html" title="A keresztapa">A keresztapa</a>
      <span>tt0068646</span>
    </div>
  `

  const rows = _internals.parsePage(html, 'https://www.mafab.hu/filmek/filmek/')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].imdbId, 'tt0068646')
})

test('parsePage extracts description from paragraph', () => {
  const html = `
    <div class="item">
      <a href="/movies/a-keresztapa-2551.html" title="A keresztapa">A keresztapa</a>
      <p>Classic mafia drama about the Corleone family.</p>
    </div>
  `

  const rows = _internals.parsePage(html, 'https://www.mafab.hu/filmek/filmek/')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].description, 'Classic mafia drama about the Corleone family.')
})

test('parseAutocompleteLabel extracts clean label text and year', () => {
  const parsed = _internals.parseAutocompleteLabel('<strong>A keresztapa</strong> (1972) - film')

  assert.equal(parsed.title, 'A keresztapa')
  assert.equal(parsed.year, 1972)
})

test('findBestAutocompleteMatch prefers exact Mafab detail URL match', () => {
  const row = {
    name: 'A keresztapa',
    url: 'https://www.mafab.hu/movies/a-keresztapa-2551.html'
  }

  const best = _internals.findBestAutocompleteMatch([
    { label: 'A keresztapa 2 (1974)', url: '/movies/a-keresztapa-2-2597.html' },
    { label: 'A keresztapa (1972)', url: '/movies/a-keresztapa-2551.html' }
  ], row)

  assert.equal(best.url, 'https://www.mafab.hu/movies/a-keresztapa-2551.html')
  assert.equal(best.year, 1972)
})

test('toMeta strips numeric prefix from bad streaming title names', () => {
  const meta = _internals.toMeta({
    name: '88 Marty Supreme',
    url: 'https://www.mafab.hu/movies/marty-supreme-1.html'
  })

  assert.equal(meta.name, 'Marty Supreme')
})

test('toMeta uses Cinemeta poster when imdb id exists', () => {
  const meta = _internals.toMeta({
    name: 'The Godfather',
    imdbId: 'tt0068646',
    url: 'https://www.mafab.hu/movies/a-keresztapa-2551.html'
  })

  assert.equal(meta.poster, 'https://images.metahub.space/poster/medium/tt0068646/img')
})

test('toMeta has no poster when imdb id is missing', () => {
  const meta = _internals.toMeta({
    name: 'Ismeretlen film',
    url: 'https://www.mafab.hu/movies/ismeretlen-film-1.html'
  })

  assert.equal(meta.poster, undefined)
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

test('toMeta generates mafab: prefixed id when no imdb id', () => {
  const meta = _internals.toMeta({
    name: 'Ismeretlen film',
    url: 'https://www.mafab.hu/movies/ismeretlen-film-1.html'
  })

  assert.equal(meta.id, 'mafab:ismeretlen-film-1')
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
