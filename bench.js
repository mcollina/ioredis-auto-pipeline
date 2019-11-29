'use strict'

const Redis = require('ioredis')
const auto = require('.')

let redis = new Redis({
  port: 6379,
  host: '127.0.0.1'
})

if (process.argv[2] !== 'single') {
  redis = auto(redis)
}

const key = 'TEST-KEY'

;(async function start () {
  await redis.set(
    key,
    JSON.stringify({
      hello: 'world'
    })
  )

  let prevElapsed = 0
  let firsElapsed = 0

  const results = []
  let start = Date.now()
  let last = null

  const iterations = 1000

  start = Date.now()
  await Promise.all(Array(iterations).fill(1).map(async (_, i) => {
    const ret = await redis.get(key)

    JSON.parse(ret)
    const now = Date.now()
    const elapsed = now - start
    results.push({
      index: i,
      elapsed,
      diff: elapsed - prevElapsed,
      'total-diff': elapsed - firsElapsed
    })

    prevElapsed = elapsed
    if (!firsElapsed) firsElapsed = elapsed
    if (now > last) last = now
  }))

  console.table(results, ['index', 'elapsed', 'diff', 'total-diff'])
  console.log('\ntotal-diff', last - start)
  redis.quit()
})()
