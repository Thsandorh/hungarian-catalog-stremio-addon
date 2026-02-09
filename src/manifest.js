const manifest = {
  id: 'community.porthu.catalog',
  version: '1.8.0',
  name: 'Port.hu Catalog',
  description: 'Stremio catalog addon for Port.hu movie and series listings.',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt', 'porthu:'],
  catalogs: [
    {
      type: 'movie',
      id: 'porthu-mixed',
      name: 'Film és sorozat',
      extra: [{ name: 'genre' }, { name: 'skip' }]
    }
  ]
}

module.exports = { manifest }
