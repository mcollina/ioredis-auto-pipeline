'use strict'

const kPipeline = Symbol('pipeline')
const kExec = Symbol('exec')

function auto (client) {
  let pipeline
  let running = false

  function build () {
    if (pipeline === undefined) {
      pipeline = new Pipeline(client)
    }

    return pipeline
  }

  function exec () {
    if (running) {
      return
    }

    running = true
    pipeline[kPipeline].exec(function () {
      running = false

      if (pipeline) {
        exec()
      }
    })
    pipeline = undefined
  }

  function Pipeline () {
    this[kPipeline] = client.pipeline()
    this[kExec] = false
    this.queued = 0
  }

  function buildWrap (key) {
    return function (...args) {
      const pipeline = build()

      if (!pipeline[kExec]) {
        pipeline[kExec] = true
        process.nextTick(exec)
      }

      pipeline.queued++

      return new Promise(function (resolve, reject) {
        pipeline[kPipeline][key](...args, function (err, value) {
          if (err) {
            reject(err)
            return
          }
          resolve(value)
        })
      })
    }
  }

  const obj = {}
  const notAllowedCommands = ['subscribe', 'psubscribe']
  for (const cmd of client.getBuiltinCommands()) {
    if (!notAllowedCommands.includes(cmd)) {
      obj[cmd] = buildWrap(cmd)
    }
  }

  Object.defineProperty(obj, 'queued', {
    get () {
      return build().queued
    }
  })

  Object.defineProperty(obj, kPipeline, {
    get () {
      return build()[kPipeline]
    }
  })

  return obj
}

module.exports = auto
module.exports.kPipeline = kPipeline
