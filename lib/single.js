'use strict'

const { kExec, notAllowedCommands } = require('./common')

module.exports = function autoSingle (client, whitelist, blacklist) {
  let pipeline
  let running = false
  const wrapper = {}
  const wrappedCommands = new Set(['queued'])

  for (const cmd of client.getBuiltinCommands().concat(whitelist)) {
    if (notAllowedCommands.includes(cmd) || blacklist.includes(cmd)) {
      continue
    }

    wrapper[cmd] = buildWrap(cmd)
    wrappedCommands.add(cmd)
  }

  Object.defineProperty(wrapper, 'queued', {
    get () {
      return pipeline ? pipeline.queued : 0
    }
  })

  return new Proxy(wrapper, {
    get (_, cmd) {
      const wrapped = wrappedCommands.has(cmd)
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
      if (pipeline === undefined) {
        pipeline = client.pipeline()
        pipeline[kExec] = false
        pipeline.queued = 0
      }

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
