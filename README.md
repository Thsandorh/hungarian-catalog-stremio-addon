# Port.hu Stremio Catalog Addon

A Stremio catalog addon that pulls movie and series metadata from Port.hu and exposes it through the Stremio addon API.

## Features

- Single mixed catalog (`porthu-mixed`) containing both movies and series
- Multiple extraction strategies for source resilience:
  - JSON-LD parsing (`Movie`, `TVSeries`, `ItemList`)
  - DOM card-style parsing fallback
- IMDb-backed IDs when discoverable (better cross-addon stream compatibility)
- Stable deterministic fallback IDs
- Deduplication and optional genre filtering
- Vercel-compatible API route included
- Supports both Stremio catalog URL variants:
  - `/catalog/:type/:id.json`
  - `/catalog/:type/:id/:extra.json`

## Endpoints

- `GET /manifest.json`
- `GET /catalog/:type/:id.json`
- `GET /catalog/:type/:id/:extra.json`
- `GET /meta/:type/:id.json`
- `GET /stream/:type/:id.json`

Examples:

- `/catalog/movie/porthu-mixed.json`
- `/catalog/movie/porthu-mixed/skip=0.json`
- `/catalog/movie/porthu-mixed/genre=drama&skip=0.json`

## Local development

```bash
npm install
npm run check
npm test
npm start
```

Then open: `http://127.0.0.1:7000/manifest.json`

## Deploy to Vercel

This repository includes:

- `api/index.js` serverless entrypoint
- `vercel.json` route mapping

Deploy with Vercel CLI or Git integration.

## Environment variables

- `PORT` (local server, default: `7000`)
- `CATALOG_LIMIT` (max returned items per request, default: `50`, hard cap: `100`)
- `PORT_HU_HTTP_TIMEOUT_MS` (source request timeout, default: `12000`)
- `PORT_HU_PAGE_CACHE_TTL_MS` (parsed source-page cache TTL, default: `600000`)
- `PORT_HU_CATALOG_CACHE_TTL_MS` (catalog response cache TTL, default: `300000`)
- `PORT_HU_DETAIL_CONCURRENCY` (detail enrichment concurrency, default: `8`)

## Notes

- Source HTML structure may change over time; update selectors in `parseDomCards` when needed.
- Respect source terms of use and robots policy before production use.
- See `docs/porthu-analysis.md` for live Playwright findings.


## Error handling behavior

- Catalog endpoint now returns `200` with an empty `metas` array when upstream parsing/fetch fails, preventing Stremio UI hard errors on transient source failures.


- Provides an external stream item that opens the title on Port.hu when playback is requested.


- Uses strict type separation (`/adatlap/film/` vs `/adatlap/sorozat/` + episode detection) to prevent movie/series mixing.
