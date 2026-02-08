# Port.hu technical analysis (Playwright + network)

## Summary
A real browser inspection confirms Port.hu is reachable and rendered server-side with heavy client-side enhancement scripts. The addon can reliably parse links from HTML without requiring JavaScript execution.

## Playwright findings

### Homepage (`https://port.hu`)
- Final URL resolves to `https://port.hu/`.
- HTML payload is large (~836k characters), so server-side parsing is feasible.
- Multiple redirects and session/token flow are present (`daemon.indapass.hu` then `?token=...`).
- No hard bot challenge was encountered in headless Chromium.

### Film page (`https://port.hu/film`)
- `title` observed: `Film`.
- `application/ld+json` blocks were not present in this snapshot.
- Strong signal: content links are under `/adatlap/film/.../movie-<id>`.
- Card-like elements exist (roughly dozens on page), so DOM fallback extraction is required.

### TV page (`https://port.hu/tv`)
- Final URL can include query params like `?date=ma&channel=tvchannel-5`.
- `application/ld+json` blocks were not present in this snapshot.
- Links include both `/adatlap/film/tv/...` and `/adatlap/sorozat/tv/...`, which is useful for movie/series detection.

## Implications for addon parsing
1. Keep DOM parsing as primary fallback; JSON-LD cannot be assumed.
2. Prioritize selectors containing `/adatlap/film/` and `/adatlap/sorozat/`.
3. Keep multiple source pages (`/film`, `/tv`, home) to maintain coverage.
4. Add retry/cache for production stability because the site loads many assets and analytics tags.

## Stremio URL compatibility note
Stremio clients may call catalog in both forms:
- `/catalog/:type/:id.json`
- `/catalog/:type/:id/:extra.json`

The serverless adapter should support both; otherwise, clients may show `HTTP 404` under catalog rows.
