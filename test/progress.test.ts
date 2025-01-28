import assert from 'node:assert/strict'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { beforeEach, describe, it, mock } from 'node:test'
import { createProgressStream } from '../src/progress'
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
    const stream = createProgressStream({
      time: 10,
      drain: true,
      ...options
    })

    const onProgress = mock.fn((update: ProgressUpdate) => {
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
    assert.ok(onProgress.mock.calls.length > 0, 'onProgress should have been called')
    assert.strictEqual(lastUpdate.percentage, 100, 'percentage should be 100')
    assert.strictEqual(lastUpdate.transferred, sampleData.length, 'transferred should equal sampleData length')
    assert.strictEqual(lastUpdate.remaining, 0, 'remaining should be 0')
    assert.strictEqual(typeof lastUpdate.eta, 'number', 'eta should be a number')
    assert.strictEqual(typeof lastUpdate.runtime, 'number', 'runtime should be a number')
  })

  it('should handle unknown length streams', async () => {
    const { onProgress } = await runTestStream()

    assert.ok(onProgress.mock.calls.length > 0, 'onProgress should have been called')
    assert.strictEqual(lastUpdate.percentage, 0, 'percentage should be 0')
    assert.strictEqual(lastUpdate.transferred, sampleData.length, 'transferred should equal sampleData length')
  })

  it('should handle dynamic length updates via setLength', async () => {
    const stream = createProgressStream({ time: 10, drain: true })
    const onProgress = mock.fn((update: ProgressUpdate) => {
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

    assert.strictEqual(lastUpdate.percentage, 100, 'percentage should be 100')
    assert.strictEqual(lastUpdate.transferred, sampleData.length, 'transferred should equal sampleData length')
  })
})
