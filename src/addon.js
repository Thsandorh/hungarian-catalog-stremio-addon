const http = require('node:http')
const handler = require('../api/index')

const port = Number(process.env.PORT || 7000)

const server = http.createServer((req, res) => {
  Promise.resolve(handler(req, res)).catch((error) => {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Internal server error', message: error.message }))
  })
})

server.listen(port, () => {
  console.log(`HU Catalog addon ready at http://127.0.0.1:${port}/configure`)
})
