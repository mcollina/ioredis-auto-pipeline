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
  }

  function addMethod (key) {
    Pipeline.prototype[key] = function wrap (...args) {
      if (!this[kExec]) {
        this[kExec] = true
        process.nextTick(exec)
      }

      return new Promise((resolve, reject) => {
        this[kPipeline][key](...args, function (err, value) {
          if (err) {
            reject(err)
            return
          }
          resolve(value)
        })
      })
    }
  }

  const notAllowedCommands = ['subscribe', 'psubscribe']
  for (const cmd of client.getBuiltinCommands()) {
    if (!notAllowedCommands.includes(cmd)) {
      addMethod(cmd)
    }
  }

  return build
}

module.exports = auto
module.exports.kPipeline = kPipeline
