class Util {
    /**
     * Pretty print error
     * @param error
     * @param extra
     */
    static errorPrint(error, extra = {}) {
        let err = `${'=== Begin Error ===\n---\n'
        + 'Error: '}${error.message}\n`
        const extraArray = Object.keys(extra).map((e) => `${e} : ${extra[e]}`).join('\n')
        err += extraArray
        err += `\nStack: ${error.stack}\n---\n=== End Error ===`

        console.error(err)
    }

    /**
     * Parse "Range" header `str` relative to the given file `size`.
     *
     * @param {Number} size
     * @param {String} str
     * @param {Object} opts
     * @return {Object|Number}
     */
    static rangeParser(size, str, opts) {
        if (typeof str !== 'string') return -1

        const index = str.indexOf('=')

        if (index === -1) return -1

        // split the range string
        const [rangeStr] = str.slice(index + 1).split(',')

        const range = rangeStr.split('-')
        let start = parseInt(range[0], 10)
        let end = parseInt(range[1], 10)

        // -nnn
        if (Number.isNaN(start)) {
            start = size - end
            end = size - 1
            // nnn-
        } else if (Number.isNaN(end)) {
            end = start + opts.chunkSize
        }

        // limit last-byte-pos to current length
        if (end > size - 1) {
            end = size - 1
        }

        // invalid or unsatisfiable
        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0) {
            return -1
        }

        // add range
        return { start, end }
    }
}
module.exports = Util
