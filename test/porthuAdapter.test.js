const test = require('node:test')
const assert = require('node:assert/strict')
const cheerio = require('cheerio')

const { parseJsonLdBlocks, parseDomCards, toMeta, dedupeMetas } = require('../src/porthuAdapter')

test('parseJsonLdBlocks extracts Movie and TVSeries entries', () => {
  const html = `
  <html><head>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          {"@type":"Movie", "name":"Dune", "url":"/movies/dune-123.html", "image":"/img/dune.jpg", "datePublished":"2021"},
          {"@type":"TVSeries", "name":"The Bridge", "url":"/movies/bridge-456.html", "image":"/img/bridge.jpg", "datePublished":"2011"}
        ]
      }
    </script>
  </head></html>`

  const $ = cheerio.load(html)
  const rows = parseJsonLdBlocks($, 'https://mafab.hu')

  assert.equal(rows.length, 2)
  assert.equal(rows[0].name, 'Dune')
  assert.equal(rows[0].url, 'https://mafab.hu/movies/dune-123.html')
  assert.equal(rows[1].name, 'The Bridge')
})

test('parseDomCards extracts /adatlap/ links and poster from DOM', () => {
  const html = `
  <div class="card">
    <a href="/adatlap/film/mozi/sample/movie-123" title="Sample Movie">Sample Movie</a>
    <img src="/img/f1.jpg" />
    <p class="description">Description text</p>
    <time datetime="2024">2024</time>
  </div>`

  const $ = cheerio.load(html)
  const rows = parseDomCards($, 'https://port.hu')

  assert.ok(rows.length >= 1)
  assert.equal(rows[0].name, 'Sample Movie')
  assert.equal(rows[0].url, 'https://port.hu/adatlap/film/mozi/sample/movie-123')
  assert.equal(rows[0].poster, 'https://port.hu/img/f1.jpg')
})

test('toMeta maps row to mixed meta structure', () => {
  const meta = toMeta({
    name: 'Sample Movie',
    url: 'https://port.hu/adatlap/film/mozi/sample/movie-123',
    genre: 'drama, sci-fi',
    poster: 'https://img/x.jpg',
    description: 'Description text'
  })

  assert.equal(meta.type, 'movie')
  assert.equal(meta.name, 'Sample Movie')
  assert.deepEqual(meta.genres, ['drama', 'sci-fi'])
  assert.match(meta.id, /^(tt|porthu:mixed:)/)
})

test('dedupeMetas merges fields from duplicates', () => {
  const metas = dedupeMetas([
    { id: 'a', type: 'movie', name: 'X', poster: null, description: 'D1' },
    { id: 'a', type: 'movie', name: 'X', poster: 'P1', description: null }
  ])

  assert.equal(metas.length, 1)
  assert.equal(metas[0].poster, 'P1')
  assert.equal(metas[0].description, 'D1')
})
