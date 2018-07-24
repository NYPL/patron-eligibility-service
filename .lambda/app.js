const express = require('express')
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware')
const app = express()
const checkEligibility = require('./checkEligibility.js').checkEligibility

app.use(awsServerlessExpressMiddleware.eventContext())

app.get('/api/v0.1/patrons/:id/hold-request-eligibility', (req, res) => {
  const id = req.params.id
  const params = req.params
  return checkEligibility(id).then((result) => respond(res, result, params))
})

const respond = (res, _resp, params) => {
  var contentType = 'application/ld+json'
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
