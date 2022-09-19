const knex = require('./struct/knex')
const HTTP_CODE = require('./constants/httpCode')

class Journal {
    constructor(fs) {
        this.knex = knex
        this.fs = fs
    }

    /**
     * @description Get file metadata from database
     * @param id {String}
     * @returns {Object}
     */
    async getFile(id) {
        return this.knex(`directory as d`)
            .select('d.*', knex.raw(`jsonb_agg(to_jsonb(b) - 'fileId') as parts`))
            .leftJoin(`block as b`, 'd.id', 'b.fileId')
            .where('d.id', '=', id)
            .groupBy('d.id')
            .first()
    }

    /**
     * @description Read from discord and write to writable stream
     * @param file {Object}
     * @param stream
     * @param secret {String}
     * @param [opts] {Object}
     * @returns {Promise<*>}
     */
    async downloadFile(stream, file, secret, opts = {}) {
        return this.fs.read(stream, file.parts, secret, opts)
    }

    /**
     * @description Read from readable stream and write it to fs
     * @param stream
     * @param fileName {String}
     * @returns {Promise<Object>}
     */
    async write(stream, fileName) {
        // Upload file and get parts meta and secret key
        const { secret, parts } = await this.fs.write(stream)

        // Entry in db
        const [file] = await knex('directory')
            .insert({ name: fileName })
            .returning('*')
        const partsToInsert = parts.map((p) => ({
            fileId: file.id, url: p.url, size: p.size, iv: p.iv,
        }))
        await knex('block').insert(partsToInsert)

        const fileMeta = await this.getFile(file.id)
        fileMeta.secret = secret

        return fileMeta
    }
}

module.exports = Journal
