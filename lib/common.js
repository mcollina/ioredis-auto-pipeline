'use strict'

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
  return target
    .getBuiltinCommands()
    .concat(whitelist)
    .filter(cmd => {
      return !(notAllowedCommands.includes(cmd) || blacklist.includes(cmd))
    })
}

module.exports = {
  kExec,
  kCallbacks,
  notAllowedCommands,
  sanitizeOptions,
  enumerateWrappableCommands
}
