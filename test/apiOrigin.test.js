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
    sources: { mafab: true }
  })

  assert.match(html, /stremio:\/\/porthu-addon\.vercel\.app\//)
  assert.doesNotMatch(html, /stremio:\/\/https:\/\//)
})


test('configure html uses plain /manifest.json for default config', () => {
  const html = renderConfigureHtml('https://porthu-addon.vercel.app', {
    sources: { mafab: true }
  })

  assert.match(html, /<code id="manifestUrl">https:\/\/porthu-addon\.vercel\.app\/manifest\.json<\/code>/)
  assert.match(html, /href="stremio:\/\/porthu-addon\.vercel\.app\/manifest\.json"/)
})

test('configure html uses tokenized manifest path for non-default config', () => {
  const html = renderConfigureHtml('https://porthu-addon.vercel.app', {
    sources: { mafab: false }
  })

  assert.match(html, /<code id="manifestUrl">https:\/\/porthu-addon\.vercel\.app\/[A-Za-z0-9_-]+\/manifest\.json<\/code>/)
})

test('tokenized manifest endpoint returns catalogs without server error', async () => {
  const token = encodeConfig({ sources: { mafab: true } })
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


test('manifest endpoint includes absolute logo url', async () => {
  const token = encodeConfig({ sources: { mafab: true } })
  const req = {
    url: `/${token}/manifest.json`,
    headers: {
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'flix.example.com'
    }
  }

  let body = ''
  const res = {
    statusCode: 0,
    setHeader() {},
    end(chunk = '') {
      body += chunk
    }
  }

  await apiHandler(req, res)

  assert.equal(res.statusCode, 200)
  const payload = JSON.parse(body)
  assert.equal(payload.logo, 'https://flix.example.com/logo.svg')
})

test('logo svg endpoint returns image content type', async () => {
  const req = {
    url: '/logo.svg',
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
  assert.match(headers['content-type'], /image\/svg\+xml/)
  assert.match(body, /<svg/)
})
