import { Buffer } from 'node:buffer'
import { Writable } from 'node:stream'

interface ConcatStreamOptions {
  encoding?: string | null
}

const isArrayish = (arr: unknown) => /Array\]$/.test(Object.prototype.toString.call(arr))

const isBufferish = (p: unknown) =>
  typeof p === 'string' || isArrayish(p) || (p && typeof (p as any).subarray === 'function')

export class ConcatStream extends Writable {
  encoding: ConcatStreamOptions['encoding'] | null
  shouldInferEncoding: boolean
  body: any[]
  constructor(opts?: ConcatStreamOptions | ((body: any) => void), cb?: (body: any) => void) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }
    if (!opts) opts = {}

    super({ objectMode: true })

    this.encoding = opts.encoding ? (String(opts.encoding).toLowerCase() as ConcatStreamOptions['encoding']) : null
    this.shouldInferEncoding = !this.encoding
    this.body = []

    if (cb) {
      this.on('finish', () => void cb(this.getBody()))
    }
  }

  _write(chunk: any, enc: NodeJS.BufferEncoding, next?: () => void) {
    this.body.push(chunk)
    next?.()
  }

  inferEncoding(buff?: unknown) {
    const firstBuffer = buff === undefined ? this.body[0] : buff
    if (Buffer.isBuffer(firstBuffer)) return 'buffer'
    if (typeof Uint8Array !== 'undefined' && firstBuffer instanceof Uint8Array) return 'uint8array'
    if (Array.isArray(firstBuffer)) return 'array'
    if (typeof firstBuffer === 'string') return 'string'
    if (Object.prototype.toString.call(firstBuffer) === '[object Object]') return 'object'
    return 'buffer'
  }

  getBody() {
    if (!this.encoding && this.body.length === 0) return []
    if (this.shouldInferEncoding) this.encoding = this.inferEncoding()

    switch (this.encoding) {
      case 'array':
        return this.arrayConcat(this.body)
      case 'string':
        return this.stringConcat(this.body)
      case 'buffer':
        return this.bufferConcat(this.body)
      case 'uint8array':
        return this.u8Concat(this.body)
      default:
        return this.body
    }
  }

  stringConcat(parts: any[]) {
    const strings = []
    for (const p of parts) {
      if (typeof p === 'string' || Buffer.isBuffer(p)) strings.push(p)
      else strings.push(Buffer.from(isBufferish(p) ? p : String(p)))
    }

    return Buffer.isBuffer(parts[0]) ? Buffer.concat(strings as Buffer[]).toString('utf8') : strings.join('')
  }

  bufferConcat(parts: any[]): Buffer {
    return Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(isBufferish(p) ? p : String(p)))))
  }

  arrayConcat<T>(parts: T[]) {
    return parts.flat()
  }

  u8Concat(parts: Uint8Array[]): Uint8Array {
    const u8 = new Uint8Array(
      parts.reduce((len, part) => len + (typeof part === 'string' ? Buffer.from(part).length : part.length), 0)
    )
    parts.reduce((offset, part) => {
      const buffer = typeof part === 'string' ? Buffer.from(part) : part
      u8.set(buffer, offset)
      return offset + buffer.length
    }, 0)
    return u8
  }
}

export const concat = (opts?: ConcatStreamOptions | ((body: any) => void), cb?: (body: any) => void) =>
  new ConcatStream(opts, cb)
