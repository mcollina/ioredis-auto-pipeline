'use strict'

const { test, teardown } = require('tap')
const Redis = require('ioredis')
const auto = require('..')

const redis = new Redis.Cluster([
  {
    host: '127.0.0.1',
    port: 30001
  },
  {
    host: '127.0.0.1',
    port: 30002
  },
  {
    host: '127.0.0.1',
    port: 30003
  }
])

redis.defineCommand('custom', { numberOfKeys: 1, lua: 'return {KEYS[1]}' })

teardown(async () => {
  await redis.quit()
})

test('automatic create a pipeline', async ({ plan, is }) => {
  plan(4)

  const pipeline = auto(redis)
  is(pipeline.wrapped, redis)

  await pipeline.set('foo', 'bar')
  is(pipeline.queued, 0)

  const promise = pipeline.get('foo')
  is(pipeline.queued, 1)

  is(await promise, 'bar')
})

test('do not wrap non-compatible commands', async ({ plan, is }) => {
  plan(2)

  const pipeline = auto(redis)

  is(pipeline.queued, 0)
  const promises = []

  promises.push(pipeline.subscribe('subscribe').catch(() => {}))
  promises.push(pipeline.unsubscribe('subscribe').catch(() => {}))

  is(pipeline.queued, 0)
  await promises
})

test('hide blacklisted commands', async ({ plan, is, isNot }) => {
  plan(2)

  const pipeline = auto(redis, { blacklist: ['hmget'] })
  is(pipeline.queued, 0)

  const promise = pipeline.hmget('foo').catch(() => {})

  is(pipeline.queued, 0)
  await promise
})

test('include whitelisted commands', async ({ plan, isNot }) => {
  plan(1)

  const pipeline = auto(redis, { whitelist: ['whatever'] })

  isNot(pipeline.whatever, undefined)
})

test('loop gets', async ({ plan, deepEqual }) => {
  plan(1)

  const pipeline = auto(redis)

  await pipeline.set('foo1', 'bar')
  await pipeline.set('foo2', 'bar')

  deepEqual(
    await Promise.all([
      pipeline.get('foo1'),
      pipeline.get('foo2'),
      pipeline.get('foo1'),
      pipeline.get('foo2'),
      pipeline.get('foo1')
    ]),
    ['bar', 'bar', 'bar', 'bar', 'bar']
  )
})

test('verify reject', async ({ plan, deepEqual, rejects, is }) => {
  plan(1)

  const pipeline = auto(redis)

  await rejects(pipeline.set('foo'))
})

test('counter', async ({ plan, is }) => {
  plan(4)

  const pipeline = auto(redis)

  is(pipeline.queued, 0)
  const promise1 = pipeline.set('foo1', 'bar')
  const promise2 = pipeline.set('foo2', 'bar')

  is(pipeline.queued, 2)
  await promise1
  await promise2

  is(pipeline.queued, 0)
  const promise3 = Promise.all([
    pipeline.get('foo1'),
    pipeline.get('foo2'),
    pipeline.get('foo1'),
    pipeline.get('foo2'),
    pipeline.get('foo1')
  ])
  is(pipeline.queued, 5)
  await promise3
})

test('supports callback in the happy case', ({ plan, is, error }) => {
  plan(9)

  const pipeline = auto(redis)
  let value1, value2

  function done () {
    is(value1, 'bar1')
    is(value2, 'bar2')
    is(pipeline.queued, 0)
  }

  /*
    In this test, foo1 and foo2 usually (like in the case of 3 nodes scenario) belongs
    to different nodes group.
    Therefore we are also testing callback scenario with multiple pipelines fired together.
  */
  pipeline.set('foo1', 'bar1', () => {})

  is(pipeline.queued, 1)

  pipeline.set('foo2', 'bar2', () => {
    pipeline.get('foo1', (err, v1) => {
      error(err)
      value1 = v1

      // This is needed as we cannot really predict which nodes responds first
      if (value1 && value2) {
        done()
      }
    })

    is(pipeline.queued, 1)

    pipeline.get('foo2', (err, v2) => {
      error(err)
      value2 = v2

      // This is needed as we cannot really predict which nodes responds first
      if (value1 && value2) {
        done()
      }
    })

    is(pipeline.queued, 2)
  })

  is(pipeline.queued, 2)
})

test('supports callbacks in the failure case', ({ plan, is, error }) => {
  plan(4)

  const pipeline = auto(redis)

  pipeline.set('foo1', 'bar1', err => {
    error(err)
  })

  is(pipeline.queued, 1)

  pipeline.set('foo2', err => {
    is(err.message, "ERR wrong number of arguments for 'set' command")
  })

  is(pipeline.queued, 2)
})

test('should handle callbacks failures', ({ plan, is, error }) => {
  plan(5)

  const pipeline = auto(redis)
  is(pipeline.queued, 0)

  pipeline.set('foo1', 'bar1', err => {
    error(err)

    throw new Error('E')
  })

  pipeline.set('foo2', 'bar2', err => {
    error(err)

    is(pipeline.queued, 0)
  })

  is(pipeline.queued, 2)
})

test('should handle general pipeline failures', ({ plan, is, error }) => {
  plan(4)

  const pipeline = auto(redis, { whitelist: ['custom'] })

  is(pipeline.queued, 0)

  pipeline.custom('foo1', err => {
    is(err.message, 'Sending custom commands in pipeline is not supported in Cluster mode.')
  })

  pipeline.set('foo1', 'bar1', err => {
    is(err.message, 'Sending custom commands in pipeline is not supported in Cluster mode.')
  })

  is(pipeline.queued, 2)
})

test('should handle general pipeline failures callback failure', ({ plan, is, error }) => {
  plan(4)

  const pipeline = auto(redis, { whitelist: ['custom'] })

  is(pipeline.queued, 0)

  pipeline.custom('foo1', err => {
    is(err.message, 'Sending custom commands in pipeline is not supported in Cluster mode.')

    throw new Error('E')
  })

  pipeline.set('foo1', 'bar1', err => {
    is(err.message, 'Sending custom commands in pipeline is not supported in Cluster mode.')
  })

  is(pipeline.queued, 2)
})
