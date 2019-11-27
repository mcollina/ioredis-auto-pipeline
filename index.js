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

  class Pipeline {
    constructor (client) {
      this[kPipeline] = client.pipeline()
      this[kExec] = false
    }

    get (key) {
      if (!this[kExec]) {
        this[kExec] = true
        setImmediate(exec)
      }
      return new Promise((resolve, reject) => {
        this[kPipeline].get(key, function (err, value) {
          if (err) {
            reject(err)
            return
          }
          resolve(value)
        })
      })
    }

    set (key, value) {
      if (!this[kExec]) {
        this[kExec] = true
        setImmediate(exec)
      }
      return new Promise((resolve, reject) => {
        this[kPipeline].set(key, value, function (err, value) {
          if (err) {
            reject(err)
            return
          }
          resolve(value)
        })
      })
    }
  }

  return build
}

module.exports = auto
