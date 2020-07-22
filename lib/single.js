'use strict'

const { kExec, kCallbacks, enumerateWrappableCommands } = require('./common')

module.exports = function autoSingle (client, whitelist, blacklist) {
  let pipeline
  let running = false

  const wrapper = {}
  const wrappedCommands = enumerateWrappableCommands(client, whitelist, blacklist)

  for (const cmd of wrappedCommands) {
    wrapper[cmd] = buildWrap(cmd)
  }

  Object.defineProperty(wrapper, 'queued', {
    get () {
      return pipeline ? pipeline.length : 0
    }
  })

  Object.defineProperty(wrapper, 'wrapped', {
    get () {
      return client
    }
  })

  wrappedCommands.push('queued', 'wrapped')

  return new Proxy(wrapper, {
    get (_, cmd) {
      const wrapped = wrappedCommands.indexOf(cmd) !== -1
      let implementation = wrapped ? wrapper[cmd] : client[cmd]

      if (typeof implementation === 'function') {
        implementation = implementation.bind(wrapped ? wrapper : client)
      }

      return implementation
    }
  })

  function exec () {
    if (running) {
      return
    }

    running = true
    const callbacks = pipeline[kCallbacks]

    pipeline.exec(function (_, results) {
      running = false

      // Invoke all callbacks
      for (let i = 0; i < callbacks.length; i++) {
        try {
          callbacks[i](...results[i])
        } catch (e) {
          client.emit(
            'pipeline:error', new Error(`Uncaught exception thrown in a ioredis-auto-pipeline cluster callback: ${e}`)
          )
        }
      }

      if (pipeline) {
        exec()
      }
    })

    pipeline = undefined
  }

  function buildWrap (key) {
    return function (...args) {
      if (pipeline === undefined) {
        pipeline = client.pipeline()
        pipeline[kExec] = false
        pipeline[kCallbacks] = []
      }

      if (!pipeline[kExec]) {
        pipeline[kExec] = true
        process.nextTick(exec)
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
