'use strict'

const cronometro = require('cronometro')
const Redis = require('ioredis')
const { isMainThread } = require('worker_threads')

const autoProxy = require('..')
const autoOld = require('./old')

const redisOldClient = new Redis({ port: 6379, host: '127.0.0.1' })
const redisProxy = autoProxy(new Redis({ port: 6379, host: '127.0.0.1' }))
const redisOld = autoOld(redisOldClient)
const redis = new Redis({ port: 6379, host: '127.0.0.1' })
const key = 'TEST-KEY'

function command () {
  const choice = Math.random()

  if (choice < 0.3) {
    return 'ttl'
  } else if (choice < 0.6) {
    return 'exists'
  }

  return 'get'
}

async function start () {
  await redis.set(
    key,
    JSON.stringify({
      hello: 'world'
    })
  )

  await cronometro({ proxy: true, old: true, base: true }, { print: { compare: true } })

  await redisProxy.quit()
  await redisOldClient.quit()
  await redis.quit()
}

if (isMainThread) {
  start()
} else {
  cronometro({
    proxy () {
      return Promise.all(Array.from(Array(1E3)).map(() => redisProxy[command()](key)))
    },
    old () {
      return Promise.all(Array.from(Array(1E3)).map(() => redisOld[command()](key)))
    },
    base () {
      return Promise.all(Array.from(Array(1E3)).map(() => redis[command()](key)))
    }
  })
}
