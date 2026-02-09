const test = require('node:test')
const assert = require('node:assert/strict')

const { createManifest } = require('../src/manifest')

test('manifest exposes Mafab category catalogs when only mafab is enabled', () => {
  const manifest = createManifest({ sources: { mafab: true, porthu: false } })
  const ids = manifest.catalogs.map((c) => c.id)

  assert.deepEqual(ids, ['mafab-movies', 'mafab-series', 'mafab-streaming', 'mafab-cinema'])
})

test('manifest keeps Mafab and Port.hu catalogs separate when both enabled', () => {
  const manifest = createManifest({ sources: { mafab: true, porthu: true } })
  const ids = manifest.catalogs.map((c) => c.id)

  assert.ok(ids.includes('porthu-mixed'))
  assert.ok(ids.includes('mafab-movies'))
  assert.ok(!ids.includes('hu-mixed'))
})
