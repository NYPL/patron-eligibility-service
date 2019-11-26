var wrapper = require('@nypl/sierra-wrapper')
const nyplCoreObjects = require('@nypl/nypl-core-objects')
var logger = require('./logger')
const kms = require('./lib/kms-helper')

function initialCheck (patronId) {
  const body = {
    json: true,
    method: 'POST',
    body: {
      recordType: 'i',
      recordNumber: 10000000,
      pickupLocation: 'maii2'
    }
  }
  return wrapper.apiPost(`patrons/${patronId}/holds/requests`, body, (errorBibReq, results) => {
    if (errorBibReq) {
      return new Promise((resolve, reject) => {
        resolve(errorBibReq.description === 'XCirc error : Bib record cannot be loaded')
      })
    }
  })
}

function handleEligible () {
  return { eligibility: true }
}

function getPatronInfo (patronId) {
  return wrapper.apiGet(`patrons/${patronId}`, (errorBibReq, results) => {
    if (errorBibReq) {
      logger.error('error getting patron info: ', errorBibReq)
    }
    return new Promise((resolve, reject) => {
      resolve(results)
    })
  })
}

/**
 *  Given an patron-info hash (i.e. one retrieved via patrons/{patronId}),
 *  returns a Hash with the following boolean properties:
 *   - expired: True if card expird
 *   - blocked: True if card has blocks
 *   - moneyOwed: True if card has > $15 fines
 *   - ptypeDisallowsHolds: True if patron ptype disallows holds (e.g. ptype 120, 121)
 *  Essentially, if Object.keys(hash).map((
 */
function identifyPatronIssues (info) {
  info = info.data.entries[0]
  const issues = {
    expired: new Date(info.expirationDate) < new Date(),
    blocked: info.blockInfo.code !== '-', // will want to change this once we have a list of block codes
    moneyOwed: info.moneyOwed > 15, // may want to change this
    ptypeDisallowsHolds: ptypeDisallowsHolds(info.patronType)
  }

  // Set a single property to check for consumers that don't care *what* issues
  // there are but only that there are issues:
  issues.hasIssues = Object.keys(issues).filter((name) => issues[name]).length > 0

  return issues
}

/**
 *  For a given ptype (e.g. 10, 120), returns `true` if the ptype does not allow
 *  Sierra holds (which is indicated by the absense of any
 *  `nypl:deliveryLocationAccess` statement)
 */
function ptypeDisallowsHolds (ptype) {
  const ptypeMapping = nyplCoreObjects('by-patron-type')
  if (!ptypeMapping) throw new Error('Could not load patron types')

  if (!ptypeMapping[ptype]) throw new Error(`Could not find ptype '${ptype}' in ptype mapping`)
  const locationTypes = ptypeMapping[ptype].accessibleDeliveryLocationTypes

  return !locationTypes || (Array.isArray(locationTypes) && locationTypes.length === 0)
}

function handleFinesBlocksOrExpiration (data) {
  // return JSON.stringify(data)
  return Object.assign({ eligibility: false }, data)
}

function getPatronHolds (patronId) {
  return { eligibility: false }
}

function setConfigValue (config, envVariable, key) {
  return kms.decrypt(process.env[envVariable]).then(result => { config[key] = result; return null })
}

function config () {
  const config = {'base': process.env.SIERRA_BASE}
  return Promise.all([setConfigValue(config, 'SIERRA_KEY', 'key'), setConfigValue(config, 'SIERRA_SECRET', 'secret')])
    .then(values => { wrapper.loadConfig(config) })
}

function checkEligibility (patronId) {
  return config().then(() => {
    return wrapper.promiseAuth((error, results) => {
      if (error) logger.error('promiseAuthError', error)
      return new Promise((resolve, reject) => {
        initialCheck(patronId).then((eligible) => {
          if (eligible) {
            resolve(handleEligible())
          } else {
            getPatronInfo(patronId).then((info) => {
              const issues = identifyPatronIssues(info)
              if (issues.hasIssues) {
                resolve(handleFinesBlocksOrExpiration(issues))
              } else {
                resolve(getPatronHolds(patronId))
              }
            })
          }
        })
      })
    })
  })
}

module.exports = {
  checkEligibility,
  ptypeDisallowsHolds,
  identifyPatronIssues
}
