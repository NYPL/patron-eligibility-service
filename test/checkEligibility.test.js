const LambdaTester = require('lambda-tester')
const sinon = require('sinon')
const kmsHelper = require('../lib/kms-helper')
const handler = require('../index').handler
const wrapper = require('@nypl/sierra-wrapper')

describe('Lambda index handler', function () {
  before(function () {
    sinon.stub(kmsHelper, 'decrypt').callsFake(function (encrypted) {
      return Promise.resolve('fake decrypted secret')
    })
    sinon.stub(wrapper, 'apiGet').callsFake((path, cb) => {
      const goodResponse = {
        'data': {
          'total': 1,
          'entries': [
            {
              'id': 5459252,
              'expirationDate': '2022-04-01',
              'birthDate': '1996-11-22',
              'patronType': 10,
              'patronCodes': {
                'pcode1': '-',
                'pcode2': 'p',
                'pcode3': 2,
                'pcode4': 0
              },
              'homeLibraryCode': 'lb',
              'message': {
                'code': '-',
                'accountMessages': [
                  'digitallionprojectteam@nypl.org'
                ]
              },
              'blockInfo': {
                'code': 'c'
              },
              'moneyOwed': 115.92
            }
          ]
        },
        'url': 'https://nypl-sierra-test.iii.com/iii/sierra-api/v3/patrons/5459252'
      }

      return new Promise((resolve, reject) => {
        resolve(cb(null, goodResponse))
      })
    })
    sinon.stub(wrapper, 'apiPost').callsFake((path, data, cb) => {
      let body
      if (path.includes('1001006')) {
        body = { description: 'XCirc error : Bib record cannot be loaded' }
      } else {
        body = { description: 'blahblahblah' }
      }
      return new Promise((resolve, reject) => { resolve(cb(body, false)) })
    })
    sinon.stub(wrapper, 'promiseAuth').callsFake((cb) => {
      return cb(null, null)
    })
  })

  it('PatronEligibility responds with \'eligible to place holds\' for an eligible patron', function () {
    return LambdaTester(handler)
      .event({ path: '/api/v0.1/patrons/1001006/hold-request-eligibility' })
      .expectResult((result) => {
        expect(result.body).to.equal('{\n  "eligibility": true\n}')
      })
  })
  it('PatronEligibility responds with a string representation of an errors object for an ineligible patron', function () {
    return LambdaTester(handler)
      .event({ path: '/api/v0.1/patrons/5459252/hold-request-eligibility' })
      .expectResult((result) => {
        expect(result.body).to.equal('{\n  "eligibility": false,\n  "expired": false,\n  "blocked": true,\n  "moneyOwed": true\n}')
      })
  })
})
