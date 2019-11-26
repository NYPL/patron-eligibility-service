// const fs = require('fs')
const LambdaTester = require('lambda-tester')
const sinon = require('sinon')
const wrapper = require('@nypl/sierra-wrapper')

const kmsHelper = require('../lib/kms-helper')
const handler = require('../index').handler
const checkEligibility = require('../checkEligibility')

describe('Lambda index handler', function () {
  before(function () {
    process.env.SIERRA_BASE = 'https://example.com'

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
        expect(JSON.parse(result.body)).to.include({ eligibility: false, expired: false, blocked: true, moneyOwed: true })
      })
  })
})

describe('checkEligibility', function () {
  describe('ptypeDisallowsHolds', function () {
    it('returns false for typical Researcher/scholar ptypes', function () {
      // Ptype 10 (Adult 18-64 Metro (3 Year)) allows
      expect(checkEligibility.ptypeDisallowsHolds(10)).to.equal(false)
      // Ptype 89: Cullman scholar
      expect(checkEligibility.ptypeDisallowsHolds(89)).to.equal(false)
    })

    it('returns true for Easy Borrowing ptypes', function () {
      // Ptype 120: Easy Borrowing AdultPilot
      expect(checkEligibility.ptypeDisallowsHolds(120)).to.equal(true)
      // Ptype 121: Easy Borrowing SeniorPilot
      expect(checkEligibility.ptypeDisallowsHolds(121)).to.equal(true)
    })
  })

  describe('identifyPatronIssues', function () {
    let patronInfo

    beforeEach(() => {
      patronInfo = {
        'data': {
          'total': 1,
          'entries': [
            {
              'id': 5459252,
              'expirationDate': '2022-04-01',
              'birthDate': '1996-11-22',
              'patronType': 10,
              'blockInfo': {
                'code': '-'
              },
              'moneyOwed': 0
            }
          ]
        }
      }
    })

    it('identifies no issue if patron has no issues', function () {
      expect(checkEligibility.identifyPatronIssues(patronInfo)).to.be.a('object')
      expect(checkEligibility.identifyPatronIssues(patronInfo).hasIssues).to.eq(false)
    })

    it('identifies issue if ptype bars holds', function () {
      patronInfo['data']['entries'][0]['patronType'] = 120

      expect(checkEligibility.identifyPatronIssues(patronInfo)).to.be.a('object')
      expect(checkEligibility.identifyPatronIssues(patronInfo).hasIssues).to.eq(true)
      expect(checkEligibility.identifyPatronIssues(patronInfo).ptypeDisallowsHolds).to.eq(true)
    })

    it('identifies issue if patron owes > $15', function () {
      patronInfo['data']['entries'][0]['moneyOwed'] = 115.0

      expect(checkEligibility.identifyPatronIssues(patronInfo)).to.be.a('object')
      expect(checkEligibility.identifyPatronIssues(patronInfo).hasIssues).to.eq(true)
      expect(checkEligibility.identifyPatronIssues(patronInfo).moneyOwed).to.eq(true)
    })

    it('identifies issue if patron has blocks', function () {
      patronInfo['data']['entries'][0]['blockInfo']['code'] = 'c'

      expect(checkEligibility.identifyPatronIssues(patronInfo)).to.be.a('object')
      expect(checkEligibility.identifyPatronIssues(patronInfo).hasIssues).to.eq(true)
      expect(checkEligibility.identifyPatronIssues(patronInfo).blocked).to.eq(true)
    })

    it('identifies issue if patron has expired card', function () {
      patronInfo['data']['entries'][0]['expirationDate'] = '2019-11-25'

      expect(checkEligibility.identifyPatronIssues(patronInfo)).to.be.a('object')
      expect(checkEligibility.identifyPatronIssues(patronInfo).hasIssues).to.eq(true)
      expect(checkEligibility.identifyPatronIssues(patronInfo).expired).to.eq(true)
    })

    it('identifies all four possible issues if patron is the Snake Plissken of borrowing', function () {
      patronInfo['data']['entries'][0]['patronType'] = 120
      patronInfo['data']['entries'][0]['moneyOwed'] = 115.0
      patronInfo['data']['entries'][0]['blockInfo']['code'] = 'c'
      patronInfo['data']['entries'][0]['expirationDate'] = '2019-11-25'

      expect(checkEligibility.identifyPatronIssues(patronInfo)).to.be.a('object')
      expect(checkEligibility.identifyPatronIssues(patronInfo).hasIssues).to.eq(true)
      expect(checkEligibility.identifyPatronIssues(patronInfo).ptypeDisallowsHolds).to.eq(true)
      expect(checkEligibility.identifyPatronIssues(patronInfo).moneyOwed).to.eq(true)
      expect(checkEligibility.identifyPatronIssues(patronInfo).blocked).to.eq(true)
      expect(checkEligibility.identifyPatronIssues(patronInfo).expired).to.eq(true)
    })
  })
})
