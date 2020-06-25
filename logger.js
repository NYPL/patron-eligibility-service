const winston = require('winston')
winston.emitErrs = false

// Set logLevel to env.LOG_LEVEL - or to the level appropriate for NODE_ENV.
// Otherwise to 'debug'
const logLevel = process.env.LOG_LEVEL || {
  'production': 'info',
  'test': 'error'
}[process.env.NODE_ENV] || 'debug'

let loggerTransports = []

loggerTransports.push(new winston.transports.Console({
  level: logLevel,
  handleExceptions: true,
  json: false,
  colorize: true,
  formatter: (options) => {
    let outputObject = {
      level: options.level.toUpperCase(),
      message: options.message,
      timestamp: new Date().toISOString()
    }

    return JSON.stringify(Object.assign(outputObject, options.meta))
  }
}))

const logger = new winston.Logger({
  transports: loggerTransports,
  exitOnError: false
})

module.exports = logger
