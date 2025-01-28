import { Buffer } from 'node:buffer'
import { exec, spawn } from 'node:child_process'
import { test } from 'node:test'
import { expect } from 'expect'
import { concat } from '../src/concat'

test('ls command', () => {
  const cmd = spawn('ls', [import.meta.dirname])
  cmd.stdout.pipe(
    concat((out) => {
      exec(`ls ${import.meta.dirname}`, (_, body) => {
        expect(out.toString()).toBe(body.toString())
      })
    })
  )
})

test('array stream', () => {
  const arrays = concat({ encoding: 'array' }, (out: number[]) => {
    expect(out).toEqual([1, 2, 3, 4, 5, 6])
  })
  arrays.write([1, 2, 3])
  arrays.write([4, 5, 6])
  arrays.end()
})

test('buffer stream', () => {
  const buffers = concat((out: Buffer) => {
    expect(Buffer.isBuffer(out)).toBe(true)
    expect(out.toString('utf8')).toBe('pizza Array is not a stringy cat')
  })
  buffers.write(Buffer.from('pizza Array is not a ', 'utf8'))
  buffers.write(Buffer.from('stringy cat'))
  buffers.end()
})

test('buffer mixed writes', () => {
  const buffers = concat((out: Buffer) => {
    expect(Buffer.isBuffer(out)).toBe(true)
    expect(out.toString('utf8')).toBe('pizza Array is not a stringy cat555')
  })
  buffers.write(Buffer.from('pizza'))
  buffers.write(' Array is not a ')
  buffers.write([115, 116, 114, 105, 110, 103, 121])
  const u8 = new Uint8Array(4)
  u8[0] = 32
  u8[1] = 99
  u8[2] = 97
  u8[3] = 116
  buffers.write(u8)
  buffers.write(555)
  buffers.end()
})

test('type inference works as expected', () => {
  const stream = concat()
  expect(stream.inferEncoding(['hello'])).toBe('array')
  expect(stream.inferEncoding(Buffer.from('hello'))).toBe('buffer')
  expect(stream.inferEncoding(undefined)).toBe('buffer')
  expect(stream.inferEncoding(new Uint8Array(1))).toBe('uint8array')
  expect(stream.inferEncoding('hello')).toBe('string')
  expect(stream.inferEncoding('')).toBe('string')
  expect(stream.inferEncoding({ hello: 'world' })).toBe('object')
  expect(stream.inferEncoding(1)).toBe('buffer')
})

test('no callback stream', () => {
  const stream = concat()
  stream.write('space')
  stream.end(' cats')
})

test('no encoding set, no data', () => {
  const stream = concat((data: any) => {
    expect(data).toEqual([])
  })
  stream.end()
})

test('encoding set to string, no data', () => {
  const stream = concat({ encoding: 'string' }, (data: string) => {
    expect(data).toBe('')
  })
  stream.end()
})

test('typed array stream', () => {
  const a = new Uint8Array(5)
  a[0] = 97
  a[1] = 98
  a[2] = 99
  a[3] = 100
  a[4] = 101 // 'abcde'

  const b = new Uint8Array(3)
  b[0] = 32
  b[1] = 102
  b[2] = 103 // ' fg'

  const c = new Uint8Array(4)
  c[0] = 32
  c[1] = 120
  c[2] = 121
  c[3] = 122 // ' xyz'

  return new Promise<void>((resolve) => {
    const arrays = concat({ encoding: 'Uint8Array' }, (out: Uint8Array) => {
      expect(typeof out.subarray).toBe('function')
      expect(Buffer.from(out).toString('utf8')).toBe('abcde fg xyz')
      resolve()
    })

    arrays.write(a)
    arrays.write(b)
    arrays.end(c)
  })
})

test('typed array from strings, buffers, and arrays', () => {
  return new Promise<void>((resolve) => {
    const arrays = concat({ encoding: 'Uint8Array' }, (out: Uint8Array) => {
      expect(typeof out.subarray).toBe('function')
      expect(Buffer.from(out).toString('utf8')).toBe('abcde fg xyz')
      resolve()
    })

    arrays.write('abcde')
    arrays.write(Buffer.from(' fg '))
    arrays.end([120, 121, 122]) // 'xyz'
  })
})

test('writing objects', () => {
  const stream = concat({ encoding: 'objects' }, (objs: any[]) => {
    expect(objs.length).toBe(2)
    expect(objs[0]).toEqual({ foo: 'bar' })
    expect(objs[1]).toEqual({ baz: 'taco' })
  })
  stream.write({ foo: 'bar' })
  stream.write({ baz: 'taco' })
  stream.end()
})

test('switch to objects encoding if no encoding specified and objects are written', () => {
  const stream = concat((objs: any[]) => {
    expect(objs.length).toBe(2)
    expect(objs[0]).toEqual({ foo: 'bar' })
    expect(objs[1]).toEqual({ baz: 'taco' })
  })
  stream.write({ foo: 'bar' })
  stream.write({ baz: 'taco' })
  stream.end()
})

test('string -> buffer stream', () => {
  const strings = concat({ encoding: 'buffer' }, (out: Buffer) => {
    expect(Buffer.isBuffer(out)).toBe(true)
    expect(out.toString('utf8')).toBe('nacho dogs')
  })
  strings.write('nacho ')
  strings.write('dogs')
  strings.end()
})

test('string stream', () => {
  const strings = concat({ encoding: 'string' }, (out: string) => {
    expect(typeof out).toBe('string')
    expect(out).toBe('nacho dogs')
  })
  strings.write('nacho ')
  strings.write('dogs')
  strings.end()
})

test('end chunk', () => {
  const endchunk = concat({ encoding: 'string' }, (out: string) => {
    expect(out).toBe('this is the end')
  })
  endchunk.write('this ')
  endchunk.write('is the ')
  endchunk.end('end')
})

test('string from mixed write encodings', () => {
  const strings = concat({ encoding: 'string' }, (out: string) => {
    expect(typeof out).toBe('string')
    expect(out).toBe('nacho dogs')
  })
  strings.write('na')
  strings.write(Buffer.from('cho'))
  strings.write([32, 100])
  const u8 = new Uint8Array(3)
  u8[0] = 111
  u8[1] = 103
  u8[2] = 115
  strings.end(u8)
})

test('string from buffers with multibyte characters', () => {
  const strings = concat({ encoding: 'string' }, (out: string) => {
    expect(typeof out).toBe('string')
    expect(out).toBe('☃☃☃☃☃☃☃☃')
  })
  const snowman = Buffer.from('☃')
  for (let i = 0; i < 8; i++) {
    strings.write(snowman.subarray(0, 1))
    strings.write(snowman.subarray(1))
  }
  strings.end()
})

test('string infer encoding with empty string chunk', () => {
  const strings = concat((out: string) => {
    expect(typeof out).toBe('string')
    expect(out).toBe('nacho dogs')
  })
  strings.write('')
  strings.write('nacho ')
  strings.write('dogs')
  strings.end()
})

test('to string numbers', () => {
  const write = concat((str: string) => {
    expect(str).toBe('a1000')
  })
  write.write('a')
  write.write(1000)
  write.end()
})
