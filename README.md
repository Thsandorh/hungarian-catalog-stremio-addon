# Port.hu Stremio Catalog Addon

A Stremio catalog addon that pulls movie and series metadata from Port.hu and exposes it through the Stremio addon API.

## Features

- Movie and series catalogs (`porthu-movie`, `porthu-series`)
- Multiple extraction strategies for source resilience:
  - JSON-LD parsing (`Movie`, `TVSeries`, `ItemList`)
  - DOM card-style parsing fallback
- Stable deterministic meta IDs
- Deduplication and optional genre filtering
- Vercel-compatible API route included
- Supports both Stremio catalog URL variants:
  - `/catalog/:type/:id.json`
  - `/catalog/:type/:id/:extra.json`

## Endpoints

- `GET /manifest.json`
- `GET /catalog/:type/:id.json`
- `GET /catalog/:type/:id/:extra.json`

Examples:

- `/catalog/movie/porthu-movie.json`
- `/catalog/movie/porthu-movie/skip=0.json`
- `/catalog/series/porthu-series/genre=drama&skip=0.json`

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

## Notes

- Source HTML structure may change over time; update selectors in `parseDomCards` when needed.
- Respect source terms of use and robots policy before production use.
- See `docs/porthu-analysis.md` for live Playwright findings.
