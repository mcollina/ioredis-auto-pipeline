'use strict'

const { test, teardown } = require('tap')
const Redis = require('ioredis')
const auto = require('..')

const redis = new Redis()

teardown(async () => {
  await redis.quit()
})

test('should automatic create a pipeline', async ({ plan, is }) => {
  plan(4)

  const pipeline = auto(redis)
  is(pipeline.wrapped, redis)

  await pipeline.set('foo', 'bar')
  is(pipeline.queued, 0)

  const promise = pipeline.get('foo')
  is(pipeline.queued, 1)

  is(await promise, 'bar')
})

test('should support commands queued after a pipeline is already queued for execution', ({ plan, is, error }) => {
  plan(7)

  const pipeline = auto(redis)
  let value1
  is(pipeline.queued, 0)

  pipeline.set('foo1', 'bar1', () => {})
  pipeline.set('foo2', 'bar2', () => {})

  pipeline.get('foo1', (err, v1) => {
    error(err)
    value1 = v1
  })

  process.nextTick(() => {
    pipeline.get('foo2', (err, value2) => {
      error(err)

      is(value1, 'bar1')
      is(value2, 'bar2')
      is(pipeline.queued, 0)
    })
  })

  is(pipeline.queued, 3)
})

test('should not wrap non-compatible commands', async ({ plan, is }) => {
  plan(2)

  const pipeline = auto(redis)

  is(pipeline.queued, 0)
  const promises = []

  promises.push(pipeline.subscribe('subscribe').catch(() => {}))
  promises.push(pipeline.unsubscribe('subscribe').catch(() => {}))

  is(pipeline.queued, 0)
  await promises
})

test('should hide blacklisted commands', async ({ plan, is, isNot }) => {
  plan(2)

  const pipeline = auto(redis, { blacklist: ['hmget'] })
  is(pipeline.queued, 0)

  const promise = pipeline.hmget('foo').catch(() => {})

  is(pipeline.queued, 0)
  await promise
})

test('should include whitelisted commands', async ({ plan, isNot }) => {
  plan(1)

  const pipeline = auto(redis, { whitelist: ['whatever'] })

  isNot(pipeline.whatever, undefined)
})

test('should support multiple commands', async ({ plan, deepEqual }) => {
  plan(1)

  const pipeline = auto(redis)
  await pipeline.set('foo', 'bar')

  deepEqual(
    await Promise.all([
      pipeline.get('foo'),
      pipeline.get('foo'),
      pipeline.get('foo'),
      pipeline.get('foo'),
      pipeline.get('foo')
    ]),
    ['bar', 'bar', 'bar', 'bar', 'bar']
  )
})

test('should handle rejections', async ({ plan, deepEqual, rejects, is }) => {
  plan(1)

  const pipeline = auto(redis)
  await pipeline.set('foo', 'bar')
  await rejects(pipeline.set('foo'))
})

test('should correctly track pipeline length', async ({ plan, is }) => {
  plan(4)

  const pipeline = auto(redis)
  is(pipeline.queued, 0)
  const promise1 = pipeline.set('foo', 'bar')
  is(pipeline.queued, 1)
  await promise1

  is(pipeline.queued, 0)
  const promise2 = Promise.all([
    pipeline.get('foo'),
    pipeline.get('foo'),
    pipeline.get('foo'),
    pipeline.get('foo'),
    pipeline.get('foo')
  ])
  is(pipeline.queued, 5)
  await promise2
})

test('should support callbacks in the happy case', ({ plan, is, error }) => {
  plan(10)

  const pipeline = auto(redis)
  let value1
  is(pipeline.queued, 0)

  pipeline.set('foo1', 'bar1', () => {})

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

test('should support callbacks in the failure case', ({ plan, is, error }) => {
  plan(5)

  const pipeline = auto(redis)
  is(pipeline.queued, 0)

  pipeline.set('foo1', 'bar1', err => {
    error(err)
  })

  is(pipeline.queued, 1)

  pipeline.set('foo2', err => {
    is(err.message, "ERR wrong number of arguments for 'set' command")
  })

  is(pipeline.queued, 2)
})

test('should handle callbacks failures', ({ plan, is, error, throws, expectUncaughtException }) => {
  plan(6)
  expectUncaughtException(new Error('ERROR'))

  const pipeline = auto(redis)
  is(pipeline.queued, 0)

  pipeline.set('foo1', 'bar1', err => {
    error(err)

    throw new Error('ERROR')
  })

  pipeline.set('foo2', 'bar2', err => {
    error(err)

    is(pipeline.queued, 0)
  })

  is(pipeline.queued, 2)
})
