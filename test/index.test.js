/* eslint-env mocha */
const LambdaTester = require('lambda-tester')
const sinon = require('sinon')
const wrapper = require('@nypl/sierra-wrapper')

const kmsHelper = require('../lib/kms-helper')
const handler = require('../index').handler

describe('Lambda index handler', function () {
  before(function () {
    process.env.SIERRA_BASE = 'https://example.com'

    sinon.stub(kmsHelper, 'decrypt').callsFake(function (encrypted) {
      return Promise.resolve('fake decrypted secret')
    })
    sinon.stub(wrapper, 'get').callsFake(() => ({
      id: 5459252,
      expirationDate: '2052-04-01',
      birthDate: '1996-11-22',
      patronType: 10,
      patronCodes: {
        pcode1: '-',
        pcode2: 'p',
        pcode3: 2,
        pcode4: 0
      },
      homeLibraryCode: 'lb',
      message: {
        code: '-',
        accountMessages: [
          'digitallionprojectteam@nypl.org'
        ]
      },
      blockInfo: {
        code: 'c'
      },
      moneyOwed: 115.92
    }))
    sinon.stub(wrapper, 'post').callsFake((path, data) => {
      let body
      if (path.includes('1001006')) {
        body = {
          response: { data: { description: 'XCirc error : Bib record cannot be loaded' } }
        }
        throw body
      } else {
        body = { description: 'blahblahblah' }
      }
      return body
    })
    sinon.stub(wrapper, 'authenticate')
  })

  after(function () {
    kmsHelper.decrypt.restore()
    wrapper.post.restore()
    wrapper.get.restore()
    wrapper.authenticate.restore()
  })

  it('PatronEligibility responds with \'eligible to place holds\' for an eligible patron', function () {
    return LambdaTester(handler)
      .event({ path: '/api/v0.1/patrons/1001006/hold-request-eligibility' })
      .expectResult((result) => {
        expect(JSON.parse(result.body)).to.include({ eligibility: true })
      })
  })
  it('PatronEligibility responds with a string representation of an errors object for an ineligible patron', function () {
    return LambdaTester(handler)
      .event({ path: '/api/v0.1/patrons/5459252/hold-request-eligibility' })
      .expectResult((result) => {
        expect(JSON.parse(result.body)).to.include({ eligibility: false, expired: false, blocked: true, moneyOwed: true })
      })
  })
})
