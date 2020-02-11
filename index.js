'use strict'

const kPipeline = Symbol('pipeline')
const kExec = Symbol('exec')

const notAllowedCommands = ['subscribe', 'psubscribe', 'pipeline', 'multi']

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

      if (!pipeline[kExec]) {
        pipeline[kExec] = true
        process.nextTick(exec)
      }

      pipeline.queued++

      return new Promise(function (resolve, reject) {
        pipeline[key](...args, function (err, value) {
          if (err) {
            reject(err)
            return
          }
          resolve(value)
        })
      })
    }
  }
}

module.exports = auto
module.exports.kPipeline = kPipeline
