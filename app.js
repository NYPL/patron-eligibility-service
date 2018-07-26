const express = require('express')
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware')
const app = express()
const checkEligibility = require('./checkEligibility.js').checkEligibility
const swaggerDocs = require('./swagger.json')

app.use(awsServerlessExpressMiddleware.eventContext())

app.get('/docs/patron-hold-request-eligibility', function (req, res) {
  res.send(swaggerDocs)
})

app.get('/api/v0.1/patrons/:id/hold-request-eligibility', (req, res) => {
  const id = req.params.id
  const params = req.params
  return checkEligibility(id).then((result) => respond(res, result, params))
})

const respond = (res, _resp, params) => {
  var contentType = 'application/json'
  if (params.ext === 'ntriples') contentType = 'text/plain'

  var resp = _resp
  if (contentType !== 'text/plain') resp = JSON.stringify(_resp, null, 2)

  res.type(contentType)
  res.status(200).send(resp)
  return true
}

// const port = process.env.PORT || config['port']
//
//   app.listen(port, function () {
//     console.log(checkEligibility)
//     console.log('Server started on port ' + port)
//   })

module.exports = app
