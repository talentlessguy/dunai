import { Transform } from 'node:stream'
import speedometer from 'speedometer'

interface ProgressStreamOptions {
  length?: number
  time?: number
  drain?: boolean
  transferred?: number
  speed?: number
  objectMode?: boolean
}

interface ProgressUpdate {
  percentage: number
  transferred: number
  length: number
  remaining: number
  eta: number
  runtime: number
  delta: number
  speed: number
}

class ProgressStream extends Transform {
  #length: number
  #time: number
  #drain: boolean
  #transferred: number
  #nextUpdate: number
  #delta: number
  #speed: (delta: number) => number
  #startTime: number
  #update: ProgressUpdate

  constructor(
    options: ProgressStreamOptions = {},
    private onprogress?: (update: ProgressUpdate) => void
  ) {
    super({ objectMode: options.objectMode || false })

    this.#length = options.length || 0
    this.#time = options.time || 0
    this.#drain = options.drain || false
    this.#transferred = options.transferred || 0
    this.#nextUpdate = Date.now() + this.#time
    this.#delta = 0
    this.#speed = speedometer(options.speed || 5000)
    this.#startTime = Date.now()

    this.#update = {
      percentage: 0,
      transferred: this.#transferred,
      length: this.#length,
      remaining: this.#length,
      eta: 0,
      runtime: 0,
      delta: 0,
      speed: 0
    }

    if (this.#drain) this.resume()
    if (this.onprogress) this.on('progress', this.onprogress)

    // Fix: Remove redundant check and handle the 'pipe' event correctly
    this.on('pipe', (stream) => {
      if (typeof this.#length === 'number' && this.#length > 0) return

      // Support http module
      if (stream.readable && (stream as any).headers) {
        const contentLength = Number.parseInt((stream as any).headers['content-length'] || '0', 10)
        if (contentLength > 0) {
          this.setLength(contentLength)
        }
        return
      }

      // Support streams with a length property
      if (typeof (stream as any).length === 'number' && (stream as any).length > 0) {
        this.setLength((stream as any).length)
        return
      }

      // Support request module
      stream.on('response', (res: any) => {
        if (!res || !res.headers) return
        if (res.headers['content-encoding'] === 'gzip') return
        if (res.headers['content-length']) {
          this.setLength(Number.parseInt(res.headers['content-length'], 10))
        }
      })
    })
  }

  _transform(chunk: any, _encoding: BufferEncoding, callback: (error?: Error | null, data?: any) => void): void {
    const len = this.readableObjectMode ? 1 : chunk.length
    this.#transferred += len
    this.#delta += len
    this.#update.transferred = this.#transferred
    this.#update.remaining = this.#length >= this.#transferred ? this.#length - this.#transferred : 0

    if (Date.now() >= this.#nextUpdate) this.#emitProgress(false)
    callback(null, chunk)
  }

  _flush(callback: (error?: Error | null) => void): void {
    this.#emitProgress(true)
    callback()
  }

  #emitProgress(ended: boolean): void {
    this.#update.delta = this.#delta
    this.#update.percentage = ended ? 100 : this.#length ? (this.#transferred / this.#length) * 100 : 0
    this.#update.speed = this.#speed(this.#delta)
    this.#update.eta = Math.round(this.#update.remaining / this.#update.speed)
    this.#update.runtime = Number.parseInt(((Date.now() - this.#startTime) / 1000).toString())
    this.#nextUpdate = Date.now() + this.#time

    this.#delta = 0

    this.emit('progress', this.#update)
  }

  setLength(newLength: number): void {
    this.#length = newLength
    this.#update.length = this.#length
    this.#update.remaining = this.#length - this.#update.transferred
    this.emit('length', this.#length)
  }

  progress(): ProgressUpdate {
    this.#update.speed = this.#speed(0)
    this.#update.eta = Math.round(this.#update.remaining / this.#update.speed)

    return this.#update
  }
}

export default function createProgressStream(
  options: ProgressStreamOptions,
  onprogress?: (update: ProgressUpdate) => void
): ProgressStream {
  if (typeof options === 'function') return createProgressStream(null as unknown as ProgressStreamOptions, options)
  return new ProgressStream(options, onprogress)
}
