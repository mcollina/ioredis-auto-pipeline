'use strict'

const { test, teardown } = require('tap')
const Redis = require('ioredis')
const auto = require('.')

const redis = new Redis()

teardown(async () => {
  await redis.quit()
})

test('automatic create a pipeline', async ({ is }) => {
  const pipeline = auto(redis)
  await pipeline().set('foo', 'bar')
  is(await pipeline().get('foo'), 'bar')
})

test('loop gets', async ({ deepEqual }) => {
  const pipeline = auto(redis)
  await pipeline().set('foo', 'bar')

  deepEqual(await Promise.all([
    pipeline().get('foo'),
    pipeline().get('foo'),
    pipeline().get('foo'),
    pipeline().get('foo'),
    pipeline().get('foo')
  ]), [
    'bar',
    'bar',
    'bar',
    'bar',
    'bar'
  ])
})

test('verify reject', async ({ deepEqual, rejects, is }) => {
  const pipeline = auto(redis)
  await pipeline().set('foo', 'bar')

  pipeline()[auto.kPipeline].get = (key, cb) => {
    is(key, 'foo')
    process.nextTick(cb, new Error('kaboom'))
  }

  pipeline()[auto.kPipeline].exec = (cb) => {
    process.nextTick(cb)
  }

  await rejects(pipeline().get('foo'))
})
