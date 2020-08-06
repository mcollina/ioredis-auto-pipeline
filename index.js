'use strict'

const calculateSlot = require('cluster-key-slot')

const notAllowedCommands = ['subscribe', 'psubscribe', 'unsubscribe', 'unpsubscribe', 'pipeline', 'multi', 'quit']
const kExec = Symbol('exec')
const kCallbacks = Symbol('callbacks')

function sanitizeOptions (options) {
  let whitelist = []
  let blacklist = []

  if (typeof options === 'object') {
    if (Array.isArray(options.whitelist)) {
      whitelist = options.whitelist.filter(command => typeof command === 'string' && command.length)
    }

    if (Array.isArray(options.blacklist)) {
      blacklist = options.blacklist.filter(command => typeof command === 'string' && command.length)
    }
  }

  return { whitelist, blacklist }
}

function enumerateWrappableCommands (target, whitelist, blacklist) {
  const commands = target
    .getBuiltinCommands()
    .concat(whitelist)
    .filter(cmd => {
      return !(notAllowedCommands.includes(cmd) || blacklist.includes(cmd))
    })

  // ioredis supports a Buffer variant of each command. Make sure we also support it
  return commands.reduce((accu, command) => {
    accu.push(command, `${command}Buffer`)
    return accu
  }, [])
}

function invokeCallbacks (callbacks, err, results) {
  if (err) {
    for (let i = 0; i < callbacks.length; i++) {
      process.nextTick(callbacks[i], err)
    }
  } else {
    for (let i = 0; i < callbacks.length; i++) {
      process.nextTick(callbacks[i], ...results[i])
    }
  }
}

// When dealing with a non cluster, always use a single key
function singleRouter () {
  return 'main'
}

function clusterRouter (_client, _cmd, ...args) {
  return calculateSlot(args[0])
}

module.exports = function single (client, options) {
  const { whitelist, blacklist } = sanitizeOptions(options)
  const router = (client.constructor.name === 'Cluster' ? clusterRouter : singleRouter).bind(null, client)

  const wrapper = {}
  const wrappedCommands = enumerateWrappableCommands(client, whitelist, blacklist)
  const pipelines = new Map()
  const running = new Set()

  // Wrap all commands
  for (const cmd of wrappedCommands) {
    wrapper[cmd] = buildWrap(cmd)
  }

  // Define some custom properties
  wrappedCommands.push('queued', 'wrapped')

  Object.defineProperty(wrapper, 'queued', {
    get () {
      let queued = 0

      for (const pipeline of pipelines.values()) {
        queued += pipeline.length
      }

      return queued
    }
  })

  // This useful in case user code wants to mess with original client internals
  Object.defineProperty(wrapper, 'wrapped', {
    get () {
      return client
    }
  })

  return new Proxy(wrapper, {
    get (_, cmd) {
      // Check if we overwrote the implementation
      const wrapped = wrappedCommands.indexOf(cmd) !== -1
      let implementation = wrapped ? wrapper[cmd] : client[cmd]

      // Bind implementation to the right object
      if (typeof implementation === 'function') {
        implementation = implementation.bind(wrapped ? wrapper : client)
      }

      return implementation
    }
  })

  function exec (key) {
    /*
      If a pipeline is already executing, keep queueing up commands
      since ioredis won't serve two pipelines at the same time
    */
    if (running.has(key)) {
      return
    }

    running.add(key)

    // Get the pipeline and immediately delete it so that new commands are queued on a new pipeline
    const pipeline = pipelines.get(key)
    pipelines.delete(key)

    const callbacks = pipeline[kCallbacks]

    // Perform the call
    pipeline.exec(function (err, results) {
      running.delete(key)

      // Invoke all callback in nextTick so the stack is cleared
      invokeCallbacks(callbacks, err, results)

      // If there is another pipeline on the same node, immediately schedule without waiting for nextTick
      if (pipelines.has(key)) {
        exec(key)
      }
    })
  }

  function buildWrap (cmd) {
    return function (...args) {
      // Check which pipeline must serve this command
      const key = router(cmd, ...args)

      // Create a new pipeline
      if (!pipelines.has(key)) {
        const pipeline = client.pipeline()
        pipeline[kExec] = false
        pipeline[kCallbacks] = []
        pipelines.set(key, pipeline)
      }

      const pipeline = pipelines.get(key)

      // Mark the pipeline as scheduled
      if (!pipeline[kExec]) {
        pipeline[kExec] = true
        process.nextTick(exec, key)
      }

      // Manage command callbacks, in both styles
      // Callback style
      if (typeof args[args.length - 1] === 'function') {
        pipeline[kCallbacks].push(args.pop())
        return pipeline[cmd](...args)
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

        pipeline[cmd](...args)
      })
    }
  }
}
