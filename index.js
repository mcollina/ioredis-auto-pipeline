'use strict'

const kPipeline = Symbol('pipeline')
const kExec = Symbol('exec')
const notAllowedCommands = ['subscribe', 'psubscribe']
const preloaded = require.main === undefined
const noop = () => {}
if (preloaded) {
  const preloader = require('./preloader')
  preloader(auto)
}

function auto (client) {
  let pipeline
  let running = false

  const obj = {}

  for (const cmd of client.getBuiltinCommands()) {
    if (!notAllowedCommands.includes(cmd)) {
      obj[cmd] = buildWrap(cmd)
    }
  }

  Object.defineProperty(obj, 'queued', {
    get () {
      if (pipeline === undefined) {
        return 0
      }

      return pipeline.queued
    }
  })

  Object.defineProperty(obj, kPipeline, {
    get () {
      if (pipeline === undefined) {
        pipeline = client.pipeline()
        pipeline[kExec] = false
        pipeline.queued = 0
      }

      return pipeline
    }
  })

  return obj

  function exec () {
    if (running) {
      return
    }

    running = true
    pipeline.exec(function () {
      running = false

      if (pipeline) {
        exec()
      }
    })
    pipeline = undefined
  }

  function buildWrap (key) {
    return function (...args) {
      const pipeline = this[kPipeline]
      let cb = args.slice(-1)[0]
      if (typeof cb === 'function') args.pop()
      else cb = noop

      if (!pipeline[kExec]) {
        pipeline[kExec] = true
        process.nextTick(exec)
      }

      pipeline.queued++

      // even if there is a callback ioredis always returns a promise
      return new Promise(function (resolve, reject) {
        pipeline[key](...args, function (err, value) {
          if (err) {
            cb(err)
            reject(err)
            return
          }
          cb(null, value)
          resolve(value)
        })
      })
    }
  }
}

module.exports = auto
module.exports.kPipeline = kPipeline
