# HU Movies & Series Stremio Addon (Port.hu + Mafab.hu)

Configurable Stremio addon with source selection.

## Features

- Homepage redirects to `/configure`
- Configure page with source checkboxes:
  - ✅ Mafab.hu (default enabled)
  - ⬜ Port.hu (default disabled)
- Install in Stremio button with generated `stremio://` deep link
- Mafab and Port.hu catalogs are kept separate (no merged cross-source catalog)
- Resources: `catalog`, `meta`, `stream`

## Local run

```bash
npm install
npm run check
npm test
npm start
```

Open:

- Configure page: `http://127.0.0.1:7000/configure`
- Manifest: `http://127.0.0.1:7000/manifest.json`

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

## Quick check that file changes are really present

```bash
git status --short
git diff -- README.md
git log --oneline -n 5
```
