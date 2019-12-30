'use strict'
const toFastProperties = require('to-fast-properties')
const filter = new Set(Object.keys(require.cache))
const Redis = requireIoRedisPeerDep()
const ioRedisCtorPath = require.resolve('ioredis/built/redis')
filter.add(ioRedisCtorPath)
const ioRedisLibs = Object.keys(require.cache).filter((key) => filter.has(key) === false)

function preload (auto) {
  // wrap
  class RedisAutoPipeline extends Redis {
    constructor (...args) {
      super(...args)
      const pipeline = auto(this)
      Object.setPrototypeOf(pipeline, this)
      pipeline.quit = this.quit.bind(this)
      pipeline.single = this
      return pipeline
    }
  }

  // replace
  require.cache[ioRedisCtorPath].exports.default = RedisAutoPipeline

  // unload everythig except the wrapped lib
  for (const lib of ioRedisLibs) {
    delete require.cache[lib]
  }

  // don't slow down the require cache
  toFastProperties(require.cache)

  // reload with wrapped Redis constructor
  require('ioredis')
}

function requireIoRedisPeerDep () {
  try {
    return require('ioredis')
  } catch (e) {
    throw Error('ioredis must be installed to use ioredis-auto-pipeline')
  }
}

module.exports = preload
