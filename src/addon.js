const { serveHTTP } = require('stremio-addon-sdk')
const { createAddonInterface, manifest } = require('./addonInterface')

const addonInterface = createAddonInterface()
const port = Number(process.env.PORT || 7000)

serveHTTP(addonInterface, { port })

console.log(`${manifest.name} ready at http://127.0.0.1:${port}/manifest.json`)
