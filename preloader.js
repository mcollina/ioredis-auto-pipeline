'use strict'
const util = require('util')
const toFastProperties = require('to-fast-properties')
const filter = new Set(Object.keys(require.cache))
const Redis = requireIoRedisPeerDep()
const ioRedisCtorPath = require.resolve('ioredis/built/redis')
filter.add(ioRedisCtorPath)
const ioRedisLibs = Object.keys(require.cache).filter((key) => filter.has(key) === false)
const kArgs = Symbol('args')
const kSubClient = Symbol('sub-client')
const kPsubClient = Symbol('psub-client')
function preload (auto) {
  const sharedInstances = []
  // wrap
  class RedisAutoPipeline extends Redis {
    constructor (...args) {
      super(...args)
      const sharedInstance = sharedInstances.find(({ options }) => {
        return sameOptions(options, this.options)
      })
      if (sharedInstance) return sharedInstance

      this[kArgs] = args
      const pipeline = auto(this)
      Object.setPrototypeOf(pipeline, this)
      pipeline.client = this
      sharedInstances.push(pipeline)
      return pipeline
    }

    subscribe (...args) {
      this[kSubClient] = this[kSubClient] || new RedisAutoPipeline(this[kArgs])
      return this[kSubClient].subscribe(...args)
    }

    psubscribe (...args) {
      this[kPsubClient] = this[kPsubClient] || new RedisAutoPipeline(this[kArgs])
      return this[kPsubClient].subscribe(...args)
    }

    quit (...args) {
      return this.client.quit(...args)
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

function sameOptions (a, b) {
  return a.port === b.port &&
      a.host === b.host &&
      a.family === b.family &&
      a.connectTimeout === b.connectTimeout &&
      a.retryStrategy === b.retryStrategy &&
      a.keepAlive === b.keepAlive &&
      a.noDelay === b.noDelay &&
      a.connectionName === b.connectionName &&
      a.sentinels === b.sentinels &&
      a.name === b.name &&
      a.role === b.role &&
      a.sentinelRetryStrategy === b.sentinelRetryStrategy &&
      a.natMap === b.natMap &&
      a.enableTLSForSentinelMode === b.enableTLSForSentinelMode &&
      a.updateSentinels === b.updateSentinels &&
      a.password === b.password &&
      a.db === b.db &&
      a.dropBufferSupport === b.dropBufferSupport &&
      a.enableOfflineQueue === b.enableOfflineQueue &&
      a.enableReadyCheck === b.enableReadyCheck &&
      a.autoResubscribe === b.autoResubscribe &&
      a.autoResendUnfulfilledCommands === b.autoResendUnfulfilledCommands &&
      a.lazyConnect === b.lazyConnect &&
      a.keyPrefix === b.keyPrefix &&
      a.reconnectOnError === b.reconnectOnError &&
      a.readOnly === b.readOnly &&
      a.stringNumbers === b.stringNumbers &&
      a.maxRetriesPerRequest === b.maxRetriesPerRequest &&
      a.maxLoadingRetryTime === b.maxLoadingRetryTime &&
      a.showFriendlyErrorStack === b.showFriendlyErrorStack &&
      (typeof a.tls === 'object' && a.tls !== null ? util.isDeepStrictEqual(a.tls, b.tls) : a.tls === b.tls)
}
