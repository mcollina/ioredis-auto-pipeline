'use strict'

const calculateSlot = require('cluster-key-slot')
const { kExec, kCallbacks, notAllowedCommands } = require('./common')
const kRunning = Symbol('running')

module.exports = function autoCluster (cluster, whitelist, blacklist) {
  const pipelines = new Map()
  const wrapper = {}
  const wrappedCommands = new Set(['queued'])

  for (const cmd of cluster.getBuiltinCommands().concat(whitelist)) {
    if (notAllowedCommands.includes(cmd) || blacklist.includes(cmd)) {
      continue
    }

    wrapper[cmd] = buildWrap(cmd)
    wrappedCommands.add(cmd)
  }

  Object.defineProperty(wrapper, 'queued', {
    get () {
      let queued = 0

      for (const pipeline of pipelines.values()) {
        queued += pipeline.length
      }

      return queued
    }
  })

  return new Proxy(wrapper, {
    get (_, cmd) {
      const wrapped = wrappedCommands.has(cmd)
      let implementation = wrapped ? wrapper[cmd] : cluster[cmd]

      if (typeof implementation === 'function') {
        implementation = implementation.bind(wrapped ? wrapper : cluster)
      }

      return implementation
    }
  })

  function exec (slot) {
    const pipeline = pipelines.get(slot)

    // Check if the pipeline still exists, since the if statement below
    if (!pipeline || pipeline[kRunning]) {
      return
    }

    pipeline[kRunning] = true
    const callbacks = pipeline[kCallbacks]
    pipelines.delete(slot)

    pipeline.exec(function (err, results) {
      pipeline[kRunning] = false

      // Invoke all callback
      if (err) {
        for (let i = 0; i < callbacks.length; i++) {
          try {
            callbacks[i](err)
          } catch (e) {
            cluster.emit(
              'pipeline:error', new Error(`Uncaught exception thrown in a ioredis-auto-pipeline cluster callback: ${e}`)
            )
          }
        }
      } else {
        for (let i = 0; i < callbacks.length; i++) {
          try {
            callbacks[i](...results[i])
          } catch (e) {
            cluster.emit(
              'pipeline:error', new Error(`Uncaught exception thrown in a ioredis-auto-pipeline cluster callback: ${e}`)
            )
          }
        }
      }

      // If there is another pipeline on the same slot, immediately schedule without waiting for nextTick
      if (pipelines.has(slot)) {
        exec(slot)
      }
    })
  }

  function buildWrap (key) {
    return function (...args) {
      const slot = calculateSlot(args[0])

      if (!pipelines.has(slot)) {
        const pipeline = cluster.pipeline()
        pipeline[kExec] = false
        pipeline[kCallbacks] = []
        pipelines.set(slot, pipeline)
      }

      const pipeline = pipelines.get(slot)

      if (!pipeline[kExec]) {
        pipeline[kExec] = true
        process.nextTick(exec, slot)
      }

      // Callback style
      if (typeof args[args.length - 1] === 'function') {
        pipeline[kCallbacks].push(args.pop())
        return pipeline[key](...args)
      }

      // Promise style
      return new Promise(function (resolve, reject) {
        pipeline[kCallbacks].push(function (err, value) {
          if (err) {
            reject(err)
            return
          }
          resolve(value)
        })

        pipeline[key](...args)
      })
    }
  }
}
