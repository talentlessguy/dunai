import type { Readable, Transform, Writable } from 'stream'

type Stream = Readable | Writable | Transform
type Callback = (err?: Error) => void

export const pump = (...streams: (Stream | Callback)[]): Stream => {
  const callback = typeof streams[streams.length - 1] === 'function' ? (streams.pop() as Callback) : () => {}

  const pipeline = streams as Stream[]
  if (pipeline.length < 2) throw new Error('At least two streams required')

  let error: Error | null = null
  const cleanups: (() => void)[] = []

  const handleError = (err: Error) => {
    if (error) return
    error = err
    cleanups.forEach((fn) => fn())
    callback(err)
  }

  let pending = pipeline.length
  const checkCompletion = () => {
    if (--pending === 0 && !error) {
      cleanups.forEach((fn) => fn())
      callback()
    }
  }

  pipeline.forEach((stream, i) => {
    const reading = i < pipeline.length - 1
    const writing = i > 0

    const cleanup = () => {
      if (stream.destroyed) return

      if ('close' in stream && typeof stream.close === 'function') {
        ;(stream as any).close()
      } else if ('abort' in stream && typeof stream.abort === 'function') {
        ;(stream as any).abort()
      } else if (typeof stream.destroy === 'function') {
        stream.destroy()
      }
    }

    const onEnd = () => reading && checkCompletion()
    const onFinish = () => writing && checkCompletion()

    stream.once('error', handleError)
    if (reading) stream.once('end', onEnd)
    if (writing) stream.once('finish', onFinish)

    cleanups.push(() => {
      stream.off('error', handleError)
      stream.off('end', onEnd)
      stream.off('finish', onFinish)
      cleanup()
    })
  })

  return pipeline.reduce((a, b) => a.pipe(b as Writable))
}
