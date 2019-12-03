const express = require('express')
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware')
const app = express()
const checkEligibility = require('./checkEligibility.js').checkEligibility
const swaggerDocs = require('./swagger.json')
const { SierraError, ParameterError } = require('./lib/errors')

app.use(awsServerlessExpressMiddleware.eventContext())

app.get('/docs/patron-hold-request-eligibility', function (req, res) {
  res.send(swaggerDocs)
})

app.get('/api/v0.1/patrons/:id/hold-request-eligibility', (req, res) => {
  const id = req.params.id
  const params = req.params
  return checkEligibility(id)
    .then((result) => respond(res, result, params))
    .catch((error) => respond(res, error))
})

const respond = (response, result, params) => {
  var contentType = 'application/json'
  let httpStatus = 200

  if (result instanceof Error) {
    httpStatus = 500
    result = {
      error: result.name,
      message: result.message
    }
  }
  if (result instanceof ParameterError) {
    httpStatus = 400
  } else if (result instanceof SierraError) {
    httpStatus = 500
  }

  response.type(contentType)
  response.status(httpStatus).send(result)

  return true
}

module.exports = app
