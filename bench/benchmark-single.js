'use strict'

const cronometro = require('cronometro')
const { readFileSync } = require('fs')
const Redis = require('ioredis')
const { join } = require('path')
const { isMainThread } = require('worker_threads')

const auto = require('..')

const redis = new Redis({ port: 6379, host: '127.0.0.1' })
const autoRedis = auto(new Redis({ port: 6379, host: '127.0.0.1' }))

function command () {
  const choice = Math.random()

  if (choice < 0.3) {
    return 'ttl'
  } else if (choice < 0.6) {
    return 'exists'
  }

  return 'get'
}

async function insert () {
  console.log('Inserting fixtures keys in the server ...')

  // Use Redis to set the keys
  const start = process.hrtime.bigint()
  const keys = readFileSync(join(__dirname, 'fixtures-3.txt'), 'utf-8').split('\n')
  const keysCount = keys.length

  while (keys.length) {
    const promises = []

    for (const key of keys.splice(0, 1000)) {
      promises.push(autoRedis.set(key, key))
    }

    await Promise.all(promises)
  }

  console.log(`Inserted ${keysCount} keys in ${(Number(process.hrtime.bigint() - start) / 1e6).toFixed(2)} ms.`)
  process.exit(0)
}

async function start () {
  if (process.env.INSERT === 'true') {
    await insert()
  }

  console.log('Starting benchmark against the server ...')

  await cronometro({ auto: true, base: true }, { print: { compare: true } })

  await autoRedis.quit()
  await redis.quit()
}

if (isMainThread) {
  start()
} else {
  const keys = readFileSync(join(__dirname, 'fixtures-3.txt'), 'utf-8').split('\n')

  cronometro({
    auto () {
      const index = Math.floor(Math.random() * keys.length)

      return Promise.all(Array.from(Array(1e3)).map(() => autoRedis[command()](keys[index])))
    },
    base () {
      const index = Math.floor(Math.random() * keys.length)

      return Promise.all(Array.from(Array(1e3)).map(() => redis[command()](keys[index])))
    }
  })
}
