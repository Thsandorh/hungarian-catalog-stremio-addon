const { fetchCatalog: mafabFetchCatalog } = require('../src/mafabAdapter')
const { fetchCatalog: porthuFetchCatalog } = require('../src/porthuAdapter')
const { MAFAB_CATALOG_IDS } = require('../src/config')

async function runSync() {
  console.log('[Sync] Started background catalog fetch')
  try {
    for (const catalogId of MAFAB_CATALOG_IDS) {
      console.log(`[Sync] Fetching ${catalogId}...`)
      // Calling fetchCatalog pre-fills and persists the cache for the top results
      await mafabFetchCatalog({ catalogId, limit: 100, skip: 0 })
    }

    console.log(`[Sync] Fetching porthu-mixed...`)
    await porthuFetchCatalog({ catalogId: 'porthu-mixed', limit: 100, skip: 0 })

    console.log('[Sync] Finished background catalog fetch successfully')
  } catch (error) {
    console.error('[Sync] Error during catalog fetch:', error.message)
  }
}

if (require.main === module) {
  runSync().then(() => process.exit(0))
}

module.exports = {
  runSync
}
