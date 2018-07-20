const awsServerlessExpress = require('aws-serverless-express')
const app = require('./app')
const server = awsServerlessExpress.createServer(app)

module.exports = {
  handler: (lambdaEvent, context, callback) => {
    try {
      context.callbackWaitsForEmptyEventLoop = false
      context.succeed = (response) => {
        callback(null, response)
      }
      return awsServerlessExpress.proxy(server, lambdaEvent, context)
    } catch (error) {
      console.error('=====> Error: ', error)
    }
  },

  /**
   * Special exit handler to enable callers to force socket to be closed as
   * needed (i.e. in between tests)
   * From https://github.com/awslabs/aws-serverless-express/blob/master/example/scripts/local.js
   */
  exitHandler: (options, err) => {
    if (options.cleanup && server && server.close) {
      server.close()
    }

    if (err) console.error(err.stack)
    if (options.exit) process.exit()
  }
}
