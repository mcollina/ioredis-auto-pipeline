'use strict'

const cronometro = require('cronometro')
const { readFileSync } = require('fs')
const Redis = require('ioredis')
const { join } = require('path')
const { isMainThread } = require('worker_threads')

const auto = require('..')

const numNodes = parseInt(process.env.NODES || '3', 10)
const iterations = parseInt(process.env.ITERATIONS || '10000', 10)
const batchSize = parseInt(process.env.BATCH_SIZE || '1000', 10)
// const configuration =

const configuration = process.env.HOSTS
  ? process.env.HOSTS.split(',').map(h => {
    const host = h.split(':')

    return { host: host[0], port: parseInt(host[1], 10) }
  })
  : Array.from(Array(numNodes), (_, i) => {
    return { host: '127.0.0.1', port: 30000 + i + 1 }
  })

const redis = new Redis.Cluster(configuration)
const autoRedis = auto(new Redis.Cluster(configuration))

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
  console.log(`Inserting fixtures keys in the cluster with ${numNodes}+${numNodes} nodes ...`)

  // Use Redis to set the keys
  const start = process.hrtime.bigint()
  const keys = readFileSync(join(__dirname, `fixtures-${numNodes}.txt`), 'utf-8').split('\n')
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

  console.log(
    `Starting benchmark against a cluster with ${numNodes}+${numNodes} nodes, doing ${iterations} iterations with ${batchSize} operations each ...`
  )

  // Now run the benchmark
  await cronometro({ auto: true, base: true }, { iterations, print: { compare: true } })

  await autoRedis.quit()
  await redis.quit()
}

if (isMainThread) {
  start()
} else {
  const keys = readFileSync(join(__dirname, `fixtures-${numNodes}.txt`), 'utf-8').split('\n')

  cronometro({
    async auto () {
      const index = Math.floor(Math.random() * keys.length)

      return Promise.all(Array.from(Array(batchSize)).map(() => autoRedis[command()](keys[index])))
    },
    async base () {
      const index = Math.floor(Math.random() * keys.length)

      return Promise.all(Array.from(Array(batchSize)).map(() => redis[command()](keys[index])))
    }
  })
}
