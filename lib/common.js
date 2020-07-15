'use strict'

const notAllowedCommands = [
  'subscribe', 'psubscribe', 'unsubscribe', 'unpsubscribe', 'pipeline', 'multi', 'quit'
]

const kExec = Symbol('exec')

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

module.exports = {
  kExec,
  notAllowedCommands,
  sanitizeOptions
}
