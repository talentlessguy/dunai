import { IncomingMessage } from 'node:http'
import { Readable, type Stream, Transform } from 'node:stream'

let tick = 1,
  timer: NodeJS.Timeout
const inc = () => (tick = (tick + 1) & 65535)

const speedometer = (seconds = 5) => {
  timer = timer || ((timer = setInterval(inc, 250)), timer.unref?.(), timer)
  const size = 4 * seconds,
    buf = [0]
  let pointer = 1,
    last = (tick - 1) & 65535

  return (delta: number) => {
    let dist = Math.min((tick - last) & 65535, size)
    last = tick
    while (dist--) buf[pointer] = buf[(pointer = (pointer + 1) % size || size - 1)]
    if (delta) buf[pointer - 1] += delta
    return ((buf[pointer - 1] - (buf.length < 4 ? 0 : buf[pointer % size])) * 4) / buf.length
  }
}

export interface ProgressOptions {
  length?: number
  time?: number
  drain?: boolean
  transferred?: number
  speed?: number
  objectMode?: boolean
}

export interface ProgressUpdate {
  percentage: number
  transferred: number
  length: number
  remaining: number
  eta: number
  runtime: number
  delta?: number
  speed?: number
}

type ProgressCallback = (update: ProgressUpdate) => void

export interface ProgressStream extends Transform {
  on(event: string | symbol, listener: (...args: any[]) => void): this
  on(event: 'length', listener: (length: number) => void): this
  on(event: 'progress', listener: (update: ProgressUpdate) => void): this
  emit(event: string | symbol, ...args: any[]): boolean
  emit(event: 'length', length: number): boolean
  emit(event: 'progress', update: ProgressUpdate): boolean
}

export class ProgressStream extends Transform {
  #length: number
  #time: number
  #drain: boolean
  #transferred: number
  #nextUpdate: number
  #delta: number
  #speed: (delta: number) => number
  #startTime: number
  #update: ProgressUpdate

  constructor(options: ProgressOptions | ProgressCallback = {}, onprogress?: ProgressCallback) {
    if (typeof options === 'function') {
      onprogress = options
      options = {}
    }
    const opts = options as ProgressOptions
    super({
      objectMode: opts.objectMode,
      highWaterMark: opts.objectMode ? 16 : undefined
    })

    this.#length = opts.length || 0
    this.#time = opts.time || 0
    this.#drain = opts.drain || false
    this.#transferred = opts.transferred || 0
    this.#nextUpdate = Date.now() + this.#time
    this.#delta = 0
    this.#speed = speedometer(opts.speed || 5000)
    this.#startTime = Date.now()

    this.#update = {
      percentage: 0,
      transferred: this.#transferred,
      length: this.#length,
      remaining: this.#length,
      eta: 0,
      runtime: 0
    }

    if (this.#drain) this.resume()
    if (onprogress) this.on('progress', onprogress)

    this.#setupPipeHandler()
  }

  #emitProgress(ended = false) {
    this.#update.delta = this.#delta

    this.#update.percentage =
      ended && this.#length > 0 ? 100 : this.#length ? (this.#transferred / this.#length) * 100 : 0

    this.#update.speed = this.#speed(this.#delta)
    this.#update.eta = Math.round(this.#update.remaining / (this.#update.speed || 1))
    this.#update.runtime = Math.floor((Date.now() - this.#startTime) / 1000)
    this.#nextUpdate = Date.now() + this.#time
    this.#delta = 0

    this.emit('progress', this.#update)
  }

  _transform(chunk: any, _: BufferEncoding, callback: (error?: Error | null, data?: any) => void) {
    const len = this.readableObjectMode ? 1 : chunk.length
    this.#transferred += len
    this.#delta += len
    this.#update.transferred = this.#transferred
    this.#update.remaining = this.#length >= this.#transferred ? this.#length - this.#transferred : 0

    if (Date.now() >= this.#nextUpdate) this.#emitProgress()
    callback(null, chunk)
  }

  _flush(callback?: () => void) {
    this.#emitProgress(true)
    callback?.()
  }

  #setupPipeHandler() {
    this.on('pipe', (stream: IncomingMessage | Stream) => {
      if (typeof this.#length === 'number' && this.#length > 0) return

      if (stream instanceof IncomingMessage && stream.headers?.['content-length'])
        return this.setLength(Number.parseInt(stream.headers['content-length']))

      if ('length' in stream && typeof stream.length === 'number') return this.setLength(stream.length)

      stream.on('response', (res: IncomingMessage) => {
        if (!res.headers || res.headers['content-encoding'] === 'gzip') return
        if (res.headers['content-length']) this.setLength(Number.parseInt(res.headers['content-length']))
      })
    })
  }
  setLength(newLength: number) {
    this.#length = newLength
    this.#update.length = newLength
    this.#update.remaining = newLength - this.#transferred
    this.emit('length', newLength)
  }

  progress() {
    this.#update.speed = this.#speed(0)
    this.#update.eta = Math.round(this.#update.remaining / (this.#update.speed || 1))
    return this.#update
  }
}

export function createProgressStream(options?: ProgressOptions | ProgressCallback, onprogress?: ProgressCallback) {
  return new ProgressStream(options, onprogress)
}
