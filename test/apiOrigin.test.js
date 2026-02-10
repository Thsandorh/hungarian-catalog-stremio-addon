const test = require('node:test')
const assert = require('node:assert/strict')

const apiHandler = require('../api/index')
const { encodeConfig } = require('../src/config')
const { getRequestOrigin, renderConfigureHtml } = apiHandler._internals

test('getRequestOrigin prefers forwarded headers on deployment', () => {
  const origin = getRequestOrigin({
    headers: {
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'porthu-addon.vercel.app'
    }
  })

  assert.equal(origin, 'https://porthu-addon.vercel.app')
})

test('getRequestOrigin falls back to host header', () => {
  const origin = getRequestOrigin({
    headers: {
      host: 'localhost:7000'
    }
  })

  assert.equal(origin, 'http://localhost:7000')
})

test('configure html stremio link does not include nested https protocol', () => {
  const html = renderConfigureHtml('https://porthu-addon.vercel.app', {
    sources: { mafab: true, porthu: false }
  })

  assert.match(html, /stremio:\/\/porthu-addon\.vercel\.app\//)
  assert.doesNotMatch(html, /stremio:\/\/https:\/\//)
})

test('tokenized manifest endpoint returns catalogs without server error', async () => {
  const token = encodeConfig({ sources: { mafab: true, porthu: false } })
  const req = {
    url: `/${token}/manifest.json`,
    headers: { host: 'localhost:7000' }
  }

  let body = ''
  const headers = {}
  const res = {
    statusCode: 0,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value
    },
    end(chunk = '') {
      body += chunk
    }
  }

  await apiHandler(req, res)

  assert.equal(res.statusCode, 200)
  assert.match(headers['content-type'], /application\/json/)

  const payload = JSON.parse(body)
  assert.ok(Array.isArray(payload.catalogs))
  assert.ok(payload.catalogs.length > 0)
})
