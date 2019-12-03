var wrapper = require('@nypl/sierra-wrapper')
const nyplCoreObjects = require('@nypl/nypl-core-objects')
var logger = require('./logger')
const kms = require('./lib/kms-helper')
const { SierraError, ParameterError } = require('./lib/errors')

function initialCheck (patronId) {
  logger.debug('Performing initialCheck')
  const body = {
    json: true,
    method: 'POST',
    body: {
      recordType: 'i',
      recordNumber: 10000000,
      pickupLocation: 'maii2'
    }
  }
  // wrapper.apiPost accepts a callback but sometimes (only on success) returns
  // a Promise. Because the callback is fired in all cases, we'll just use the
  // callback interface:
  return new Promise((resolve, reject) => {
    wrapper.apiPost(`patrons/${patronId}/holds/requests`, body, (errorBibReq, results) => {
      if (errorBibReq) {
        // If the specific error is the following, the patron's account *can*
        // place holds
        const patronHoldsPossible = errorBibReq.description === 'XCirc error : Bib record cannot be loaded'
        logger.debug('Finished performing initialCheck with ' + (patronHoldsPossible ? 'favorable' : 'unfavorable') + ' response', errorBibReq)
        resolve(patronHoldsPossible)
      } else {
        // If no error was returned when placing a hold for the above
        // completely made-up item, either a record with that id was
        // created (!) or there are other issues..
        logger.error('Error: Placing a test hold on a test item did not generate an error!')
        resolve(false)
      }
    })
  })
}

function handleEligible () {
  return { eligibility: true }
}

function getPatronInfo (patronId) {
  // wrapper.apiGet does not always return a Promise, so just use callback interface:
  return new Promise((resolve, reject) => {
    wrapper.apiGet(`patrons/${patronId}`, (errorBibReq, results) => {
      if (errorBibReq) {
        logger.error('error getting patron info: ', errorBibReq)
        reject(new ParameterError(`Could not get patron info for patron ${patronId}`))
      }

      return resolve(results)
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
  issues.hasIssues = Object.values(issues).some((v) => v)

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

function handlePatronIneligible (reasons = {}) {
  return Object.assign({ eligibility: false }, reasons)
}

/**
 *  Takes a reference to a hash (config), an environmental variable key
 *  (envVariable), and a target key (key) and does the following:
 *    config[key] = decrypt(process.env[envVariable])
 *
 *  @param {Hash} config Hash to mutate
 *  @param {string} envVariable Key in `process.env` to decrypt
 *  @param {string} key Key in `config` to save decrypted value to
 *
 *  @return null
 */
function setConfigValue (config, envVariable, key) {
  return kms.decrypt(process.env[envVariable])
    .then(result => { config[key] = result; return null })
}

function config () {
  const config = {'base': process.env.SIERRA_BASE}
  return Promise.all([
    setConfigValue(config, 'SIERRA_KEY', 'key'),
    setConfigValue(config, 'SIERRA_SECRET', 'secret')
  ])
    .then(values => wrapper.loadConfig(config))
}

function sierraLogin () {
  logger.debug('Performing Sierra login')
  // wrapper.promiseAuth does not consistently return a Promise. Let's just use the callback interface
  return new Promise((resolve, reject) => {
    wrapper.promiseAuth((error, results) => {
      if (error) {
        logger.error('Error logging into Sierra: ' + error)
        return reject(new SierraError(error))
      }
      logger.debug('Sierra login successful')
      return resolve()
    })
  })
}

function checkEligibility (patronId) {
  return config()
    .then(sierraLogin)
    .then(() => initialCheck(patronId))
    .then((eligible) => {
      if (eligible) {
        return handleEligible()
      } else {
        return getPatronInfo(patronId).then((info) => {
          const issues = identifyPatronIssues(info)
          if (issues.hasIssues) {
            return handlePatronIneligible(issues)
          } else {
            return handlePatronIneligible()
          }
        })
      }
    })
}

module.exports = {
  checkEligibility,
  ptypeDisallowsHolds,
  identifyPatronIssues
}
