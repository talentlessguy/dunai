import http from 'node:http'
import progressStream from '../src/progress'

const str = progressStream({
  drain: true,
  time: 100,
  speed: 20
})

str.on('progress', (progress) => {
  console.log(`${progress.percentage.toFixed(2)}%`)
})

const options = {
  method: 'GET',
  host: 'cachefly.cachefly.net',
  path: '/10mb.test',
  headers: {
    'user-agent': 'testy test'
  }
}

http
  .request(options, (response) => {
    response.pipe(str)
  })
  .end()

console.log('progress-stream using http module - downloading 10 MB file')
