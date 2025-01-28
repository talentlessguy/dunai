import { Buffer } from 'node:buffer'
import { Writable } from 'node:stream'

interface ConcatStreamOptions {
  encoding?: string | null
}

function isArrayish(arr: unknown) {
  return /Array\]$/.test(Object.prototype.toString.call(arr))
}

function isBufferish(p: unknown) {
  return typeof p === 'string' || isArrayish(p) || (p && typeof (p as any).subarray === 'function')
}

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
      this.on('finish', () => {
        cb(this.getBody())
      })
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
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      if (typeof p === 'string') {
        strings.push(p)
      } else if (Buffer.isBuffer(p)) {
        strings.push(p)
      } else if (isBufferish(p)) {
        strings.push(Buffer.from(p))
      } else {
        strings.push(Buffer.from(String(p)))
      }
    }
    if (Buffer.isBuffer(parts[0])) {
      return Buffer.concat(strings as Buffer[]).toString('utf8')
    }
    return strings.join('')
  }

  bufferConcat(parts: any[]) {
    const bufs = []
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      if (Buffer.isBuffer(p)) {
        bufs.push(p)
      } else if (isBufferish(p)) {
        bufs.push(Buffer.from(p as string | Uint8Array))
      } else {
        bufs.push(Buffer.from(String(p)))
      }
    }
    return Buffer.concat(bufs)
  }

  arrayConcat<T>(parts: T[]) {
    return parts.flat()
  }

  u8Concat(parts: Uint8Array[]) {
    let len = 0
    for (let i = 0; i < parts.length; i++) {
      if (typeof parts[i] === 'string') {
        parts[i] = Buffer.from(parts[i])
      }
      len += parts[i].length
    }
    const u8 = new Uint8Array(len)
    for (let i = 0, offset = 0; i < parts.length; i++) {
      const part = parts[i]
      for (let j = 0; j < part.length; j++) {
        u8[offset++] = part[j]
      }
    }
    return u8
  }
}

export const concat = (opts?: ConcatStreamOptions | ((body: any) => void), cb?: (body: any) => void) => {
  return new ConcatStream(opts, cb)
}
