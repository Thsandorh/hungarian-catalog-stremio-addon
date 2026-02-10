const test = require('node:test')
const assert = require('node:assert/strict')
const cheerio = require('cheerio')

const { _internals } = require('../src/mafabAdapter')

test('mafab catalog source URLs always use www host to avoid redirect loops', () => {
  const catalogs = _internals.CATALOG_SOURCES

  for (const urls of Object.values(catalogs)) {
    for (const url of urls) {
      assert.match(url, /^https:\/\/www\.mafab\.hu\//)
    }
  }
})

test('parsePage extracts poster from lazy background image data-src', () => {
  const html = `
    <div class="item">
      <div class="image lazyNbg" data-src="/static/thumb/w150/profiles/2016/66/20/2551.jpg" style="background-image:url();"></div>
      <div class="title"><a href="/movies/a-keresztapa-2551.html" title="A keresztapa">A keresztapa</a></div>
    </div>
  `

  const rows = _internals.parsePage(html, 'https://www.mafab.hu/filmek/filmek/')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].poster, 'https://www.mafab.hu/static/thumb/w500/profiles/2016/66/20/2551.jpg')
})

test('extractPosterFromRoot prefers larger srcset candidate', () => {
  const $ = cheerio.load(`
    <div class="item">
      <img data-srcset="/static/thumb/w150/profiles/a.jpg 150w, /static/thumb/w500/profiles/a.jpg 500w" />
      <a href="/movies/test-1.html">Test</a>
    </div>
  `)

  const poster = _internals.extractPosterFromRoot($, $('.item').first(), 'https://www.mafab.hu/filmek/filmek/')
  assert.equal(poster, 'https://www.mafab.hu/static/thumb/w500/profiles/a.jpg')
})

test('upscalePosterUrl does not downgrade already-large thumbnails', () => {
  const url = 'https://www.mafab.hu/static/thumb/w1000/2019t/126/01/323732_1557184290.7753.jpg'
  assert.equal(_internals.upscalePosterUrl(url), url)
})

test('posterQualityScore prefers real poster/profile image over scene thumb', () => {
  const scene = 'https://www.mafab.hu/static/thumb/w1000/2019t/126/01/323732_1557184290.7753.jpg'
  const poster = 'https://www.mafab.hu/static/profiles/2014/317/10/237638.jpg'
  assert.ok(_internals.posterQualityScore(poster) > _internals.posterQualityScore(scene))
})

test('parseDetailHints extracts high-quality og:image and imdb id', () => {
  const html = `
    <html><head>
      <meta property="og:image" content="https://www.mafab.hu/static/profiles/2016/66/20/2551.jpg" />
      <meta property="og:description" content="Classic mafia drama." />
      <meta property="og:title" content="The Godfather" />
    </head><body>
      <a href="https://www.imdb.com/title/tt0068646/">IMDb</a>
    </body></html>
  `

  const hints = _internals.parseDetailHints(html, 'https://www.mafab.hu/movies/a-keresztapa-2551.html')
  assert.equal(hints.poster, 'https://www.mafab.hu/static/profiles/2016/66/20/2551.jpg')
  assert.equal(hints.imdbId, 'tt0068646')
  assert.equal(hints.name, 'The Godfather')
})

test('parsePage reuses poster found on duplicate movie link blocks', () => {
  const html = `
    <div class="item">
      <a href="/movies/chernobyl-323732.html"><div class="image lazyNbg" data-src="https://www.mafab.hu/static/thumb/w1000/2019t/126/01/323732_1557184290.7753.jpg"></div></a>
    </div>
    <div class="item">
      <div class="title"><a href="/movies/chernobyl-323732.html" title="Csernobil (2019)">Csernobil (2019)</a></div>
    </div>
  `

  const rows = _internals.parsePage(html, 'https://www.mafab.hu/sorozatok/sorozatok/')
  const chernobyl = rows.find((r) => /chernobyl-323732/.test(r.url))
  assert.ok(chernobyl)
  assert.equal(chernobyl.poster, 'https://www.mafab.hu/static/thumb/w1000/2019t/126/01/323732_1557184290.7753.jpg')
})
