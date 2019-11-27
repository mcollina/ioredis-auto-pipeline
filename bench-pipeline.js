'use strict'

const Redis = require('ioredis')
const auto = require('.')
const redis = new Redis({
  port: 6379,
  host: '127.0.0.1'
})

const key = 'TEST-KEY';

(async function start () {
  await redis.set(
    key,
    JSON.stringify({
      hello: 'world'
    })
  )

  let prevElapsed = 0
  let firsElapsed = 0

  const results = []
  const pipeline = auto(redis)
  let start = null
  let last = null

  const doCount = () =>
    new Promise((resolve, reject) => {
      const iterations = 1000

      Array(iterations)
        .fill(1)
        .forEach((count, i) => {
          start = Date.now()
          pipeline()
            .get(key)
            .then(ret => {
              JSON.parse(ret)
              last = Date.now()
              const elapsed = last - start
              results.push({
                index: i,
                elapsed,
                diff: elapsed - prevElapsed,
                'total-diff': elapsed - firsElapsed
              })

              prevElapsed = elapsed
              if (!firsElapsed) firsElapsed = elapsed
            })
            .catch(e => {
              console.log(e)
              reject(e)
            })
            .finally(() => {
              if (i === iterations - 1) resolve()
            })
        })
    })

  doCount().then(() => {
    console.table(results, ['index', 'elapsed', 'diff', 'total-diff'])
    console.log('total-diff', last - start)
    redis.quit()
  })
})()
