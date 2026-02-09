# HU Movies & Series Stremio Addon (Port.hu + Mafab.hu)

Configurable Stremio addon with a professional configure page and source selection.

## What is implemented

- Homepage redirects to `/configure`
- Configure UI with source checkboxes:
  - ✅ Mafab.hu (default enabled)
  - ⬜ Port.hu (default disabled)
- "Install in Stremio" button generating config-specific manifest URL
- One mixed catalog: `Film és sorozat` (`hu-mixed`)
- `catalog`, `meta`, and `stream` resources
- Source adapters:
  - `src/mafabAdapter.js`
  - `src/porthuAdapter.js`

## Mafab catalog strategy (recommended and used as base feed)

Mafab endpoints currently used for the mixed feed:

- `/filmek/filmek/`
- `/sorozatok/sorozatok/`
- `/vod/top-streaming`
- `/cinema/premier/jelenleg-a-mozikban`

These map well to practical categories:

1. Movies (main list)
2. Series (main list)
3. Top streaming
4. In cinemas now

## Local run

```bash
npm install
npm run check
npm start
```

Open:

- Configure page: `http://127.0.0.1:7000/configure`
- Manifest (default config): `http://127.0.0.1:7000/manifest.json`

## Configured manifest URL format

`http://host/<base64url-config>/manifest.json`

Example config object:

```json
{
  "sources": {
    "mafab": true,
    "porthu": false
  }
}
```

## Environment variables

- `PORT` (default: `7000`)
- `CATALOG_LIMIT` (default: `50`, max: `100`)
- `PORT_HU_HTTP_TIMEOUT_MS` (default: `12000`)
- `PORT_HU_PAGE_CACHE_TTL_MS` (default: `600000`)
- `PORT_HU_CATALOG_CACHE_TTL_MS` (default: `300000`)
- `PORT_HU_DETAIL_CONCURRENCY` (default: `8`)
- `MAFAB_HTTP_TIMEOUT_MS` (default: `12000`)
