/* eslint-env mocha */
const sinon = require('sinon')
const wrapper = require('@nypl/sierra-wrapper')

const kmsHelper = require('../lib/kms-helper')
const checkEligibility = require('../checkEligibility')

const tomorrow = new Date(new Date().getTime() + 24 * 60 * 60 * 1000)
const eligiblePatron = Object.assign(
  {},
  require('../test/fixtures/eligible-patron.json'),
  // Set expirationDate to tomorrow:
  { expirationDate: tomorrow.toISOString().split('T').shift() }
)

describe('checkEligibility', function () {
  before(() => {
    sinon.stub(kmsHelper, 'decrypt').callsFake(function (encrypted) {
      return Promise.resolve('fake decrypted secret')
    })
  })

  after(() => {
    kmsHelper.decrypt.restore()
  })

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
      patronInfo = JSON.parse(JSON.stringify({
        'data': {
          'total': 1,
          'entries': [eligiblePatron]
        }
      }))

      process.env.HOLDS_LIMIT = 15
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

    it('identifies issue if patron has reached holds limit', function () {
      expect(checkEligibility.identifyPatronIssues(patronInfo, 25).hasIssues).to.eq(true)
      expect(checkEligibility.identifyPatronIssues(patronInfo, 25).reachedHoldLimit).to.eq(true)
    })

    it('identifies all four possible issues if patron is the Snake Plissken of borrowing', function () {
      patronInfo['data']['entries'][0]['patronType'] = 120
      patronInfo['data']['entries'][0]['moneyOwed'] = 115.0
      patronInfo['data']['entries'][0]['blockInfo']['code'] = 'c'
      patronInfo['data']['entries'][0]['expirationDate'] = '2019-11-25'

      const issues = checkEligibility.identifyPatronIssues(patronInfo, 25)

      expect(issues).to.be.a('object')
      expect(issues.hasIssues).to.eq(true)
      expect(issues.ptypeDisallowsHolds).to.eq(true)
      expect(issues.moneyOwed).to.eq(true)
      expect(issues.blocked).to.eq(true)
      expect(issues.expired).to.eq(true)
      expect(issues.reachedHoldLimit).to.eq(true)
    })
  })

  describe('checkEligibility', function () {
    before(function () {
      // Stub the test hold:
      const bibCanNotBeLoadedResponse = { description: 'XCirc error : Bib record cannot be loaded' }
      sinon.stub(wrapper, 'post').callsFake(() => bibCanNotBeLoadedResponse)

      // Stub login:
      sinon.stub(wrapper, 'authenticate')
    })

    after(function () {
      wrapper.post.restore()
      wrapper.authenticate.restore()
    })

    describe('eligible ptypes', function () {
      before(function () {
        // Stub the patron fetch:
        sinon.stub(wrapper, 'get').callsFake(() => ({
          'data': {
            'entries': [
              {
                'expirationDate': '2022-04-01',
                'patronType': 10,
                'blockInfo': { 'code': '-' },
                'moneyOwed': 0.0
              }
            ]
          }
        }))
      })

      after(function () {
        wrapper.get.restore()
      })

      it('considers ptype 10 eligible', function () {
        return checkEligibility.checkEligibility(5459252)
          .then((response) => {
            expect(response).to.be.a('object')
            expect(response.eligibility).to.eq(true)
          })
      })
    })

    describe('ineligible ptypes', function () {
      before(function () {
        // Stub the patron fetch:
        sinon.stub(wrapper, 'get').callsFake(() => {
          return {
            'data': {
              'entries': [
                {
                  'expirationDate': '2022-04-01',
                  'patronType': 120,
                  'blockInfo': { 'code': '-' },
                  'moneyOwed': 0.0
                }
              ]
            }
          }
        })
      })

      after(function () {
        wrapper.get.restore()
      })

      it('considers ptype 120 ineligible', function () {
        return checkEligibility.checkEligibility(5459252)
          .then((response) => {
            expect(response).to.be.a('object')
            expect(response.eligibility).to.eq(false)
          })
      })
    })
  })

  // describe('checkEligibility sierra connection errors', function () {
  //   let patronId = 5459252
  //   let numberOfSimulatedNetworkFailures = null

  //   let loggerErrorSpy = null

  //   this.timeout(10000)

  //   beforeEach(function () {
  //     // Stub the wrapper.apiPost to throw an error:
  //     let tries = 0
  //     sinon.stub(wrapper, 'post').callsFake((path, body, cb) => {
  //       // Simulate an error thrown within the wrapper (e.g. network timeout)
  //       // the first N times.
  //       tries += 1
  //       if (tries <= numberOfSimulatedNetworkFailures) throw new Error("Cannot read property 'statusCode' of undefined")

  //       // Stub the test hold:
  //       const bibCanNotBeLoadedResponse = { description: 'XCirc error : Bib record cannot be loaded' }
  //       cb(bibCanNotBeLoadedResponse)
  //     })

  //     loggerErrorSpy = sinon.spy(logger, 'error')
  //   })

  //   afterEach(() => {
  //     wrapper.apiPost.restore()
  //     logger.error.restore()
  //   })

  //   before(() => {
  //     // Stub login:
  //     sinon.stub(wrapper, 'authenticate')

  //     // Stub the other two data calls
  //     const get = sinon.stub(wrapper, 'get')
  //     get.withArgs(`patrons/${patronId}`)
  //       .callsFake(() => ({ data: { total: 1, entries: [eligiblePatron] } }))
  //     get.withArgs(`patrons/${patronId}/holds`)
  //       .callsFake(() => ({ data: { entries: [{ total: 10 }] } }))
  //   })

  //   after(function () {
  //     wrapper.get.restore()
  //     wrapper.authenticate.restore()
  //   })

  //   it('retries sierra connection three times', () => {
  //     numberOfSimulatedNetworkFailures = 2

  //     return checkEligibility.checkEligibility(patronId)
  //       .then((response) => {
  //         expect(response).to.be.a('object')
  //         expect(response.eligibility).to.eq(true)

  //         // Expect no error logs:
  //         expect(loggerErrorSpy.callCount).to.eq(0)
  //       })
  //   })

  //   it('logs error if sierra connection fails after third time', () => {
  //     numberOfSimulatedNetworkFailures = 3

  //     return expect(checkEligibility.checkEligibility(patronId))
  //       .to.be.rejectedWith(Error, `Exhausted retry attempts placing test hold for patron ${patronId}`)
  //       .then(() => {
  //         // Expect one error log:
  //         expect(loggerErrorSpy.callCount).to.eq(1)
  //       })
  //   })
  // })

  describe('getPatronHoldsCount', function () {
    before(function () {
      // Stub the patron fetch:
      sinon.stub(wrapper, 'get').callsFake(() => {
        return {
          'data': {
            'entries': [
              {
                'total': 10
              }
            ]
          }
        }
      })
    })

    after(function () {
      wrapper.get.restore()
    })

    it('returns number of holds for the patron', function () {
      return checkEligibility.getPatronHoldsCount(5459252)
        .then((response) => {
          expect(response).to.eq(10)
        })
    })
  })
})
