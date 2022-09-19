/* eslint-disable no-restricted-syntax,no-await-in-loop */
const https = require('https')
const crypto = require('crypto')
const { REST } = require('@discordjs/rest')
const uuid = require('uuid').v4
const AsyncStreamProcessor = require('./util/AsyncStreamProcessor')
const StreamChunker = require('./util/StreamChunker')

const DEFAULT_BLOCK_SIZE = 7864320 // 7.5MB
const DEFAULT_ENCRYPTION = 'aes-256-ctr'

class DiscordFileSystem {
    constructor(opts) {
        this.webhooks = opts.webhooks
        this.blockSize = opts.blockSize || DEFAULT_BLOCK_SIZE
        this.encAlg = opts.encAlg || DEFAULT_ENCRYPTION
        this.rest = new REST({ version: 10, timeout: 30000, ...opts.restOpts })
        this.lastWbIdx = 0
    }

    get webhookURL() {
        const webhookURL = this.webhooks[this.lastWbIdx]
        this.lastWbIdx = this.lastWbIdx + 1 >= this.webhooks.length
            ? 0
            : this.lastWbIdx + 1

        return webhookURL.replace('https://discord.com/api', '')
    }

    /**
     * @description Encrypt the given buffer
     * @param secret
     * @param data
     * @returns {{encrypted: Buffer, iv: string}}
     * @private
     */
    _encrypt(secret, data) {
        // Create hash for given secret
        const key = crypto.createHash('sha256').update(secret).digest()
        // Create iv
        const iv = crypto.randomBytes(16)
        // Create cipher and encrypt the data
        const cipher = crypto.createCipheriv(this.encAlg, key, iv)
        let encrypted = cipher.update(data)
        encrypted = Buffer.concat([encrypted, cipher.final()])
        // Return iv and encrypted data

        return {
            iv: iv.toString('hex'),
            encrypted,
        }
    }

    /**
     * @description Returns the decryption cipher
     * @param secret
     * @param iv
     * @private
     */
    _decrypt(secret, iv) {
        // Create key hash
        const key = crypto.createHash('sha256').update(secret).digest()
        // Return decipher transform stream

        return crypto.createDecipheriv(this.encAlg, key, Buffer.from(iv, 'hex'))
    }

    /**
     * @description Upload single file to discord
     * @param file {Object}
     * @returns {Promise<unknown>}
     * @private
     */
    _uploadFile(file) {
        return this.rest.post(this.webhookURL, { files: [file], auth: false })
    }

    /**
     * @description Returns number of elements based on start and end
     * @param parts {Array}
     * @param start {Number}
     * @param end {Number}
     * @returns {*}
     * @private
     */
    _rangedParts(parts, start, end) {
        const chunkSize = parts[0].size
        const startPartNumber = Math.ceil(start / chunkSize) ? Math.ceil(start / chunkSize) - 1 : 0
        const endPartNumber = Math.ceil(end / chunkSize)
        const partsToDownload = parts.slice(startPartNumber, endPartNumber)
        partsToDownload[0].start = start % this.blockSize
        partsToDownload[partsToDownload.length - 1].end = end % this.blockSize

        return partsToDownload
    }

    /**
     * @description Read files from discord and write it to stream
     * @param stream
     * @param parts {Array}
     * @param secret {String}
     * @param start {Number}
     * @param end {Number}
     * @returns {Promise<void>}
     */
    async read(stream, parts, secret, { start, end }) {
        let partsToDownload = parts
        if (start || end) partsToDownload = this._rangedParts(parts, start, end)
        for (const part of partsToDownload) {
            let headers = {}
            if (part.start || part.end) headers = { Range: `bytes=${part.start || 0}-${part.end || ''}` }
            await new Promise((resolve, reject) => {
                https.get(part.url, { headers }, (res) => {
                    // Create decipher
                    const decipher = this._decrypt(secret, part.iv)
                    decipher.on('end', () => resolve())
                    decipher.on('error', (err) => reject(err))
                    res
                        .pipe(decipher)
                        .pipe(new AsyncStreamProcessor(async (data) => {
                            await new Promise((r) => stream.write(data, r))
                        }))
                    res.on('error', (err) => reject(err))
                })
            })
        }
        stream.end()
    }

    /**
     * @description Read from readable stream and upload file on discord in chunks
     * @param stream
     * @returns {Promise<unknown>}
     */
    async write(stream) {
        const parts = []
        const secret = `${uuid()}${uuid()}`.replace(/-/g, '')

        return new Promise((resolve, reject) => {
            stream
                .on('aborted', () => reject(new Error('file upload aborted'))) // On HTTP request abort delete all the messages and reject promise
                .pipe(new StreamChunker(this.blockSize))
                .pipe(new AsyncStreamProcessor(async (data) => {
                    // Encrypt the data
                    const { iv, encrypted } = this._encrypt(secret, data)
                    // Upload file to discord
                    const part = { name: uuid(), data: encrypted }
                    const { attachments: [attachment] } = await this._uploadFile(part)
                    // Push part object into array and return later
                    parts.push({
                        name: part.name, url: attachment.url, size: attachment.size, iv,
                    })
                }))
                .on('finish', () => {
                    resolve({ parts, secret })
                })
                .on('error', (err) => reject(err))
        })
    }
}

module.exports = DiscordFileSystem
