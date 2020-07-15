'use strict'

const calculateSlot = require('cluster-key-slot')
const { kExec, notAllowedCommands } = require('./common')

module.exports = function autoCluster (cluster, whitelist, blacklist) {
  let running = false
  const pipelines = new Map()
  const wrapper = {}
  const wrappedCommands = new Set(['queued', 'ready'])

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
        queued += pipeline.queued
      }

      return queued
    }
  })

  wrapper.ready = function (cb) {
    const hasCallback = typeof cb === 'function'
    if (cluster.status === 'ready') {
      if (hasCallback) {
        cb()
      }

      return
    }

    if (hasCallback) {
      cluster.once('ready', cb)
      return
    }

    return new Promise((resolve) => { cluster.on('ready', resolve) })
  }

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

  function exec () {
    if (running) {
      return
    }

    running = true
    let pending = 0

    for (const pipeline of pipelines.values()) {
      pending++

      pipeline.exec(function () {
        pending--

        if (pending === 0) {
          running = false

          if (pipelines.size > 0) {
            exec()
          }
        }
      })
    }

    pipelines.clear()
  }

  function buildWrap (key) {
    return function (...args) {
      const slot = calculateSlot(args[0])
      const targetKey = cluster.slots[slot].join(',')

      if (!pipelines.has(targetKey)) {
        const pipeline = cluster.pipeline()
        pipeline[kExec] = false
        pipeline.queued = 0
        pipelines.set(targetKey, pipeline)
      }

      const pipeline = pipelines.get(targetKey)

      if (!pipeline[kExec]) {
        pipeline[kExec] = true
        process.nextTick(exec)
      }

      pipeline.queued++

      // Callback style
      if (typeof args[args.length - 1] === 'function') {
        return pipeline[key](...args)
      }

      // Promise style
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
