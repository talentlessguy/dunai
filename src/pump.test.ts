import { afterEach, beforeEach, expect, test } from 'bun:test'
import { createReadStream, createWriteStream } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { PassThrough, Transform } from 'stream'
import { unlink } from 'fs/promises'
import { pump } from './pump'

const testFile = join(tmpdir(), 'pump-test.txt')
const testFileDest = join(tmpdir(), 'pump-test-dest.txt')

// Helper function
const createTestStream = (content: string) => {
  const stream = new PassThrough()
  stream.end(content)
  return stream
}

beforeEach(async () => {
  await Bun.write(testFile, 'Hello World')
})

afterEach(async () => {
  try {
    await unlink(testFile)
    await unlink(testFileDest)
  } catch {}
})
test('should propagate errors through the pipeline', async () => {
  const error = new Error('Transform failed')
  let callbackCalled = false

  const res = pump(
    createTestStream('data'),
    new Transform({
      transform(chunk, enc, cb) {
        cb(error)
      }
    }),
    new PassThrough(),
    (err) => {
      callbackCalled = true
      expect(err).toBe(error)
    }
  )

  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(callbackCalled).toBeTrue()
  expect(res.destroyed).toBeTrue()
})

test('should handle normal stream completion with files', async () => {
  let callbackCalled = false
  let callbackError: Error | undefined

  const res = pump(
    createReadStream(testFile),
    new Transform({
      transform(chunk, enc, cb) {
        this.push(chunk.toString().toUpperCase())
        cb()
      }
    }),
    createWriteStream(testFileDest),
    (err) => {
      callbackCalled = true
      callbackError = err
    }
  )

  // Wait for file operations
  await new Promise((resolve) => setTimeout(resolve, 200))

  expect(callbackCalled).toBeTrue()
  expect(callbackError).toBeUndefined()
  expect(res.destroyed).toBeTrue()

  const output = await Bun.file(testFileDest).text()
  expect(output).toBe('HELLO WORLD')
})

test('should return last stream in chain', async () => {
  const streams = [new PassThrough(), new PassThrough(), new PassThrough()]

  const lastStream = streams[streams.length - 1]
  const res = pump(...streams, () => {})

  expect(res).toBe(lastStream)

  // Cleanup
  streams.forEach((s) => s.destroy())
})
