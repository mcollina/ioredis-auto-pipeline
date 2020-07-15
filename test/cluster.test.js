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

teardown(async () => {
  await redis.quit()
})

test('automatic create a pipeline', async ({ plan, is }) => {
  plan(3)

  const pipeline = auto(redis)
  await pipeline.ready()

  await pipeline.set('foo', 'bar')
  is(pipeline.queued, 0)

  const promise = pipeline.get('foo')
  is(pipeline.queued, 1)

  is(await promise, 'bar')
})

test('do not wrap non-compatible commands', async ({ plan, is }) => {
  plan(2)

  const pipeline = auto(redis)
  await pipeline.ready()

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
  await pipeline.ready()

  await pipeline.set('foo1', 'bar')
  await pipeline.set('foo2', 'bar')

  deepEqual(await Promise.all([
    pipeline.get('foo1'),
    pipeline.get('foo2'),
    pipeline.get('foo1'),
    pipeline.get('foo2'),
    pipeline.get('foo1')
  ]), [
    'bar',
    'bar',
    'bar',
    'bar',
    'bar'
  ])
})

test('verify reject', async ({ plan, deepEqual, rejects, is }) => {
  plan(1)

  const pipeline = auto(redis)
  await pipeline.ready()

  await rejects(pipeline.set('foo'))
})

test('counter', async ({ plan, is }) => {
  plan(4)

  const pipeline = auto(redis)
  await pipeline.ready()

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
  plan(11)

  const pipeline = auto(redis)

  pipeline.ready((err) => {
    error(err)

    let value1
    is(pipeline.queued, 0)

    pipeline.set('foo1', 'bar1', () => { })

    is(pipeline.queued, 1)

    pipeline.set('foo2', 'bar2', () => {
      pipeline.get('foo1', (err, v1) => {
        error(err)
        value1 = v1
      })

      is(pipeline.queued, 1)

      pipeline.get('foo2', (err, value2) => {
        error(err)

        is(value1, 'bar1')
        is(value2, 'bar2')
        is(pipeline.queued, 0)
      })

      is(pipeline.queued, 2)
    })

    is(pipeline.queued, 2)
  })
})

test('supports callback in the failure case', ({ plan, is, error }) => {
  plan(6)

  const pipeline = auto(redis)

  pipeline.ready((err) => {
    error(err)

    is(pipeline.queued, 0)

    pipeline.set('foo1', 'bar1', (err) => {
      error(err)
    })

    is(pipeline.queued, 1)

    pipeline.set('foo2', (err) => {
      is(err.message, "ERR wrong number of arguments for 'set' command")
    })

    is(pipeline.queued, 2)
  })
})

test('.ready works with promises', async ({ plan, is }) => {
  plan(1)

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

  const pipeline = auto(redis)
  await pipeline.ready()
  is(pipeline.status, 'ready')
  await pipeline.quit()
})

test('.ready works with callbacks', ({ plan, is }) => {
  plan(1)

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

  const pipeline = auto(redis)

  pipeline.ready(() => {
    is(pipeline.status, 'ready')
    pipeline.quit()
  })
})
