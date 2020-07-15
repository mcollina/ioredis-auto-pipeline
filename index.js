'use strict'

const { sanitizeOptions } = require('./lib/common')
const autoSingle = require('./lib/single')
const autoCluster = require('./lib/cluster')

module.exports = function auto (client, options) {
  const { whitelist, blacklist } = sanitizeOptions(options)

  if (client.constructor.name === 'Cluster') {
    return autoCluster(client, whitelist, blacklist)
  }

  return autoSingle(client, whitelist, blacklist)
}
