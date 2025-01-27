import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { createServer } from 'node:http'
import { request } from 'node:http'
import { Readable, Writable } from 'node:stream'
import createProgressStream from './progress'

describe('ProgressStream', () => {
  let progressStream: ReturnType<typeof createProgressStream>
  let progressUpdates: Array<{ percentage: number; transferred: number; length: number }> = []
  let server: ReturnType<typeof createServer>
  let serverUrl: string

  beforeEach(() => {
    progressUpdates = []
    progressStream = createProgressStream({}, (update) => {
      progressUpdates.push({
        percentage: update.percentage,
        transferred: update.transferred,
        length: update.length
      })
    })
  })

  afterEach(() => {
    if (server) {
      server.close()
    }
  })

  it('should emit progress events as data is processed', async () => {
    const readable = new Readable({
      read() {
        this.push(Buffer.alloc(10)) // 10 bytes
        this.push(Buffer.alloc(10)) // 20 bytes
        this.push(Buffer.alloc(10)) // 30 bytes
        this.push(null) // End the stream
      }
    })

    const writable = new Writable({
      write(chunk, _encoding, callback) {
        callback()
      }
    })

    // Pipe the readable stream through the progress stream to the writable stream
    readable.pipe(progressStream).pipe(writable)

    // Wait for the stream to finish
    await new Promise((resolve) => writable.on('finish', resolve))

    // Verify progress updates
    expect(progressUpdates).toEqual([
      { percentage: 10, transferred: 10, length: 0 },
      { percentage: 20, transferred: 20, length: 0 },
      { percentage: 30, transferred: 30, length: 0 }
    ])
  })

  it('should handle dynamic length updates', async () => {
    const readable = new Readable({
      read() {
        this.push(Buffer.alloc(10)) // 10 bytes
        this.push(Buffer.alloc(10)) // 20 bytes
        this.push(null) // End the stream
      }
    })

    const writable = new Writable({
      write(chunk, _encoding, callback) {
        callback()
      }
    })

    // Pipe the readable stream through the progress stream to the writable stream
    readable.pipe(progressStream).pipe(writable)

    // Update the length dynamically
    progressStream.setLength(20)

    // Wait for the stream to finish
    await new Promise((resolve) => writable.on('finish', resolve))

    // Verify progress updates
    expect(progressUpdates).toEqual([
      { percentage: 50, transferred: 10, length: 20 }, // 10 / 20 = 50%
      { percentage: 100, transferred: 20, length: 20 } // 20 / 20 = 100%
    ])
  })

  it('should handle zero-length streams', async () => {
    const readable = new Readable({
      read() {
        this.push(null) // End the stream immediately
      }
    })

    const writable = new Writable({
      write(chunk, _encoding, callback) {
        callback()
      }
    })

    // Pipe the readable stream through the progress stream to the writable stream
    readable.pipe(progressStream).pipe(writable)

    // Wait for the stream to finish
    await new Promise((resolve) => writable.on('finish', resolve))

    // Verify progress updates
    expect(progressUpdates).toEqual([
      { percentage: 100, transferred: 0, length: 0 } // Stream ended immediately
    ])
  })

  it('should handle object mode streams', async () => {
    const objectModeStream = createProgressStream({ objectMode: true, length: 3 }, (update) => {
      progressUpdates.push({
        percentage: update.percentage,
        transferred: update.transferred,
        length: update.length
      })
    })

    const readable = new Readable({
      objectMode: true,
      read() {
        this.push({ data: 'chunk1' }) // 1 object
        this.push({ data: 'chunk2' }) // 2 objects
        this.push({ data: 'chunk3' }) // 3 objects
        this.push(null) // End the stream
      }
    })

    const writable = new Writable({
      objectMode: true,
      write(chunk, _encoding, callback) {
        callback()
      }
    })

    // Pipe the readable stream through the progress stream to the writable stream
    readable.pipe(objectModeStream).pipe(writable)

    // Wait for the stream to finish
    await new Promise((resolve) => writable.on('finish', resolve))

    // Verify progress updates
    expect(progressUpdates).toEqual([
      { percentage: 33.33333333333333, transferred: 1, length: 3 },
      { percentage: 66.66666666666666, transferred: 2, length: 3 },
      { percentage: 100, transferred: 3, length: 3 }
    ])
  })

  it('should set length from HTTP stream headers', async () => {
    // Create a local HTTP server to simulate an HTTP response
    server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Length': '20' })
      res.write(Buffer.alloc(10)) // 10 bytes
      res.write(Buffer.alloc(10)) // 20 bytes
      res.end()
    })

    server.listen(0) // Listen on a random port
    serverUrl = `http://localhost:${(server.address() as any).port}`

    const httpRequest = request(serverUrl, (response) => {
      response.pipe(progressStream).pipe(
        new Writable({
          write(chunk, _encoding, callback) {
            callback()
          }
        })
      )
    })

    httpRequest.end()

    // Wait for the stream to finish
    await new Promise((resolve) => progressStream.on('end', resolve))

    // Verify progress updates
    expect(progressUpdates).toEqual([
      { percentage: 50, transferred: 10, length: 20 }, // 10 / 20 = 50%
      { percentage: 100, transferred: 20, length: 20 } // 20 / 20 = 100%
    ])
  })

  it('should handle HTTP request to example.com', async () => {
    const exampleUrl = 'http://example.com'
    const httpRequest = request(exampleUrl, (response) => {
      response.pipe(progressStream).pipe(
        new Writable({
          write(chunk, _encoding, callback) {
            callback()
          }
        })
      )
    })

    httpRequest.end()

    // Wait for the stream to finish
    await new Promise((resolve) => progressStream.on('end', resolve))

    // Verify progress updates
    expect(progressUpdates.length).toBeGreaterThan(0)
    expect(progressUpdates[0].percentage).toBeGreaterThanOrEqual(0)
    expect(progressUpdates[0].transferred).toBeGreaterThanOrEqual(0)
    expect(progressUpdates[0].length).toBeGreaterThanOrEqual(0)
  })
})
