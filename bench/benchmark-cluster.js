'use strict'

const cronometro = require('cronometro')
const { readFileSync } = require('fs')
const Redis = require('ioredis')
const { join } = require('path')
const { isMainThread } = require('worker_threads')

const autoProxy = require('..')

const configuration = Array.from(Array(parseInt(process.env.NODES || '3', 10)), (_ , i) => {
  return { host: '127.0.0.1', port: 30000 + i + 1 }
})

const redis = new Redis.Cluster(configuration)
const autoRedis = autoProxy(new Redis.Cluster(configuration))

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
  // Use Redis to set the keys
  const start = process.hrtime.bigint()
  const keys = readFileSync(join(__dirname, 'keys.txt'), 'utf-8').split('\n')
  const keysCount = keys.length

  while(keys.length) {
    for(const key of keys.splice(0, 1000)) {
      await redis.set(key, key)
    }
  }

  console.log(`Inserted ${keysCount} keys in ${(Number(process.hrtime.bigint() - start) / 1e6).toFixed(2)} ms `)
  process.exit(0)
}

async function start () {
  if(process.env.INSERT === 'true') {
    await insert()
  }  

  // Now run the benchmark
  await cronometro({ auto: true, base: true }, { print: { compare: true } })
  
  await autoRedis.quit()
  await redis.quit()
}

if (isMainThread) {
  start()
} else {
  const keys = readFileSync(join(__dirname, 'keys.txt'), 'utf-8').split('\n')
 
  cronometro({
    async auto () {
      const index = Math.floor(Math.random() * keys.length)

      await autoRedis.ready()
      return Promise.all(Array.from(Array(1E3)).map(() => autoRedis[command()](keys[index])))
    },
    async base () {
      const index = Math.floor(Math.random() * keys.length)

      // This is not for this run but to have test run in same scenario. Note that in real world you only await once.
      await autoRedis.ready()
      return Promise.all(Array.from(Array(1E3)).map(() => redis[command()](keys[index])))
    }
  })  
}
