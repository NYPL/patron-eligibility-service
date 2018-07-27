const winston = require('winston')
winston.emitErrs = false

const logLevel = (process.env.NODE_ENV === 'production') ? 'info' : 'debug'

let loggerTransports = []

// Spewing logs while running tests is annoying
if (process.env.NODE_ENV !== 'test') {
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
}

const logger = new winston.Logger({
  transports: loggerTransports,
  exitOnError: false
})

module.exports = logger
