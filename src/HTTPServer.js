const http = require('http')
const path = require('path')
const fs = require('fs')
const HTTP_CODE = require('./constants/httpCode')
const MIME_TYPES = require('./constants/mimeTypes')
const Util = require('./util/Util')

const CHUNK_SIZE = 40 ** 6 // 4 GB

class HTTPServer {
    constructor(port, journal) {
        this.journal = journal
        this.port = port
        this.staticDir = path.join(__dirname, 'static')
    }

    start() {
        return new Promise((resolve) => {
            this._server = http
                .createServer(this._requestHandler.bind(this))
                .listen(this.port, () => resolve())
        })
    }

    async _requestHandler(req, res) {
        try {
            req.parsedURL = decodeURI(req.url).split('/')
            const [, route] = req.parsedURL

            // Handle upload and download
            if (route === 'upload') await this._upload(req, res)
            else if (route === 'download') await this._download(req, res)
            else this._handleStatic(req, res)
            // ^^ Handle static files
        } catch (err) {
            Util.errorPrint(err)
            res
                .writeHead(HTTP_CODE.INTERNAL_SERVER_ERROR)
                .end()
        }
    }

    _handleStatic(req, res) {
        let filePath = path.join(this.staticDir, req.url)
        if (filePath === path.join(this.staticDir, '/')) filePath = path.join(filePath, 'index.html')
        const extname = String(path.extname(filePath)).toLowerCase()
        const contentType = MIME_TYPES[extname] ?? 'application/octet-stream'
        fs.readFile(filePath, (error, content) => {
            if (error) {
                res.writeHead(HTTP_CODE.NOT_FOUND).end()
            } else {
                res.writeHead(200, { 'Content-Type': contentType }).end(content, 'utf-8')
            }
        })
    }

    async _upload(req, res) {
        const [,, fileName] = req.parsedURL
        if (!fileName) {
            return res
                .writeHead(HTTP_CODE.NOT_FOUND)
                .end()
        }
        const file = await this.journal.write(req, fileName)
        const resp = {
            status: true,
            file: { id: file.id, secret: file.secret },
        }

        return res
            .writeHead(200, { 'Content-Type': MIME_TYPES['.json'] })
            .end(JSON.stringify(resp))
    }

    async _download(req, res) {
        const [, , id, secret] = req.parsedURL
        const { range } = req.headers
        if (!id || !secret) {
            return res
                .writeHead(HTTP_CODE.NOT_FOUND)
                .end()
        }
        const file = await this.journal.getFile(id)
        if (!file) {
            return res
                .writeHead(HTTP_CODE.NOT_FOUND)
                .end()
        }
        const fileSize = file.parts.reduce((t, p) => t + p.size, 0)
        const parsedRange = Util.rangeParser(fileSize, range, { chunkSize: CHUNK_SIZE })
        if (range && parsedRange !== -1) {
            const { start, end } = parsedRange
            res.writeHead(HTTP_CODE.PARTIAL_CONTENT, {
                'Content-Length': end - start + 1,
                'Content-Range': `bytes ${start}-${end}/${file.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Disposition': `attachment; filename=${file.name}`,
            })

            return this.journal.downloadFile(res, file, secret, { start, end })
        }
        res.writeHead(HTTP_CODE.OK, {
            'Content-Length': fileSize,
            'Accept-Ranges': 'bytes',
            'Content-Disposition': `attachment; filename=${file.name}`,
        })

        return this.journal.downloadFile(res, file, secret)
    }
}

module.exports = HTTPServer
