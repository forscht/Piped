require('dotenv').config()
const Journal = require('./src/Journal')
const DFs = require('./src/DFs')
const HttpServer = require('./src/HTTPServer')

const { PORT, WEBHOOKS } = process.env

const dfs = new DFs({
    webhooks: WEBHOOKS.split(','),
    restOpts: {},
})

const journal = new Journal(dfs)
const httpServer = new HttpServer(PORT, journal)
httpServer.start().then(() => {
    console.log('HTTP Server started on =>', PORT)
})
