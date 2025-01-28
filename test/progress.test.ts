import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import progressStream from '../src/progress'
import type { ProgressUpdate } from '../src/progress'

const sampleData = Buffer.alloc(1024 * 10)

describe('ProgressStream', () => {
  let lastUpdate: ProgressUpdate

  beforeEach(() => {
    lastUpdate = {
      percentage: 0,
      transferred: 0,
      length: 0,
      remaining: 0,
      eta: 0,
      runtime: 0
    }
  })

  async function runTestStream(options: any = {}, data = sampleData) {
    const stream = progressStream({
      time: 10,
      drain: true,
      ...options
    })

    const onProgress = mock((update: ProgressUpdate) => {
      lastUpdate = update
    })

    stream.on('progress', onProgress)

    const consumer = new Transform({
      transform(chunk, encoding, callback) {
        callback(null, chunk)
      }
    })

    await pipeline(Readable.from(data), stream, consumer)

    return { onProgress }
  }

  it('should emit progress events with correct data', async () => {
    const { onProgress } = await runTestStream({ length: sampleData.length })

    // Verify final progress values
    expect(onProgress).toHaveBeenCalled()
    expect(lastUpdate.percentage).toBe(100)
    expect(lastUpdate.transferred).toBe(sampleData.length)
    expect(lastUpdate.remaining).toBe(0)
    expect(lastUpdate.eta).toBeNumber()
    expect(lastUpdate.runtime).toBeNumber()
  })

  it('should handle unknown length streams', async () => {
    const { onProgress } = await runTestStream()

    expect(onProgress).toHaveBeenCalled()
    expect(lastUpdate.percentage).toBe(0)
    expect(lastUpdate.transferred).toBe(sampleData.length)
  })

  it('should handle dynamic length updates via setLength', async () => {
    const stream = progressStream({ time: 10, drain: true })
    const onProgress = mock((update: ProgressUpdate) => {
      lastUpdate = update
    })

    stream.on('progress', onProgress)

    // First chunk - 50% of data
    stream.write(Buffer.alloc(5120))
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Update length to total size
    stream.setLength(sampleData.length)

    // Pipe remaining data
    await pipeline(
      Readable.from(sampleData.slice(5120)),
      stream,
      new Transform({
        transform(chunk, encoding, callback) {
          callback(null, chunk)
        }
      })
    )

    expect(lastUpdate.percentage).toBe(100)
    expect(lastUpdate.transferred).toBe(sampleData.length)
  })
})
