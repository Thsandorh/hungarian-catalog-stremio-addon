const test = require('node:test')
const assert = require('node:assert/strict')

const { createManifest } = require('../src/manifest')

test('manifest exposes Mafab category catalogs when mafab is enabled', () => {
  const manifest = createManifest({ sources: { mafab: true } })
  const ids = manifest.catalogs.map((c) => c.id)
  const seriesCatalog = manifest.catalogs.find((c) => c.id === 'mafab-series')
  const extraCatalogs = [
    'mafab-cinema-soon',
    'mafab-tv',
    'mafab-movies-lists',
    'mafab-series-lists',
    'mafab-streaming-premieres'
  ]

  assert.deepEqual(ids.slice(0, 4), ['mafab-movies', 'mafab-series', 'mafab-streaming', 'mafab-cinema'])
  for (const id of extraCatalogs) assert.ok(ids.includes(id))
  assert.equal(seriesCatalog?.type, 'series')
})

test('manifest allows disabling selected Mafab catalogs from config', () => {
  const manifest = createManifest({
    sources: { mafab: true },
    mafabCatalogs: {
      'mafab-cinema-soon': false,
      'mafab-streaming-premieres': false
    }
  })

  const ids = manifest.catalogs.map((c) => c.id)
  assert.ok(!ids.includes('mafab-cinema-soon'))
  assert.ok(!ids.includes('mafab-streaming-premieres'))
})

test('manifest has no Port.hu catalog ids and prefixes', () => {
  const manifest = createManifest({ sources: { mafab: true } })
  const ids = manifest.catalogs.map((c) => c.id)

  assert.ok(!ids.includes('porthu-mixed'))
  assert.ok(!manifest.idPrefixes.includes('porthu:'))
})

test('manifest branding is Flix-Catalogs without invalid logo url', () => {
  const manifest = createManifest({ sources: { mafab: true } })
  assert.equal(manifest.name, 'Flix-Catalogs')
  assert.equal(manifest.id, 'community.flix.catalogs')
  assert.equal(manifest.logo, undefined)
})
