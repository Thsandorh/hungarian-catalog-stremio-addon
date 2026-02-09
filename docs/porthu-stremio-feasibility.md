# Port.hu → Stremio addon implementation notes

## Current status
The project now includes a functional implementation with:

- runtime Stremio catalog handlers,
- source fetching/parsing adapter,
- Vercel serverless HTTP adapter,
- parser unit tests.

## Why this parser design
Port.hu markup can evolve, so the adapter intentionally combines:

1. JSON-LD extraction for structured metadata where available,
2. DOM fallback extraction for card/list pages.

This reduces breakage risk when one format changes.

## Production hardening recommendations

1. Add external cache (Redis or KV) for parsed catalog responses.
2. Add retry/backoff and request budget guards.
3. Add observability (timings, parse success ratio, source errors).
4. Add integration tests with saved HTML fixtures from known Port.hu pages.
5. Validate legal compliance for scraping and content redistribution.

## Vercel readiness

The repository includes `api/index.js` + `vercel.json` so the addon can be deployed as a serverless service. The route adapter currently supports:

- `/manifest.json`
- `/catalog/:type/:id/:extra.json`

This is enough for Stremio catalog usage.
