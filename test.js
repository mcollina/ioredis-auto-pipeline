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
  await pipeline.set('foo', 'bar')
  is(await pipeline.get('foo'), 'bar')
})

test('hide non-compatible commands', async ({ is }) => {
  const pipeline = auto(redis)
  const notAllowedCommands = ['subscribe', 'psubscribe', 'pipeline', 'multi']
  for (const cmd of notAllowedCommands) {
    is(pipeline[cmd], undefined)
  }
})

test('loop gets', async ({ deepEqual }) => {
  const pipeline = auto(redis)
  await pipeline.set('foo', 'bar')

  deepEqual(await Promise.all([
    pipeline.get('foo'),
    pipeline.get('foo'),
    pipeline.get('foo'),
    pipeline.get('foo'),
    pipeline.get('foo')
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
  await pipeline.set('foo', 'bar')

  pipeline[auto.kPipeline].get = (key, cb) => {
    is(key, 'foo')
    process.nextTick(cb, new Error('kaboom'))
  }

  pipeline[auto.kPipeline].exec = (cb) => {
    process.nextTick(cb)
  }

  await rejects(pipeline.get('foo'))
})

test('counter', async ({ is }) => {
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
