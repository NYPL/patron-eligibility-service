const wrapper = require('@nypl/sierra-wrapper')
const nyplCoreObjects = require('@nypl/nypl-core-objects')
const logger = require('./logger')
const kms = require('./lib/kms-helper')
const { SierraError, ParameterError } = require('./lib/errors')

async function patronCanPlaceTestHold (patronId, attempt = 1) {
  logger.debug('Performing patronCanPlaceTestHold')
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
  try {
    await wrapper.post(`patrons/${patronId}/holds/requests`, body)
    logger.error('Error: Placing a test hold on a test item did not generate an error!')
    return false
  } catch (e) {
    const patronHoldsPossible = e.description === 'XCirc error : Bib record cannot be loaded'

    logger.debug('Finished performing patronCanPlaceTestHold with ' + (patronHoldsPossible ? 'favorable' : 'unfavorable') + ' response', e)
    return patronHoldsPossible
  }
  // return new Promise((resolve, reject) => {
  //   wrapper.apiPost(`patrons/${patronId}/holds/requests`, body, (errorBibReq, results) => {
  //     if (errorBibReq) {
  //       // If the specific error is the following, the patron's account *can*
  //       // place holds
  //       const patronHoldsPossible = errorBibReq.description === 'XCirc error : Bib record cannot be loaded'

  //       logger.debug('Finished performing patronCanPlaceTestHold with ' + (patronHoldsPossible ? 'favorable' : 'unfavorable') + ' response', errorBibReq)
  //       resolve(patronHoldsPossible)
  //     } else {
  //       // If no error was returned when placing a hold for the above
  //       // completely made-up item, either a record with that id was
  //       // created (!) or there are other issues..
  //       logger.error('Error: Placing a test hold on a test item did not generate an error!')
  //       resolve(false)
  //     }
  //   })
  // })
  //   .catch((e) => {
  //     return new Promise((resolve, reject) => {
  //       // After third failure, error hard
  //       if (attempt === 3) return reject(new Error(`Exhausted retry attempts placing test hold for patron ${patronId}. Encountered error: "${e}"`))

  //       logger.info(`Encountered error placing test hold for patron ${patronId}. Initiating attempt ${attempt + 1}.`)

  //       // Delay trying again, with exponential backoff (i.e. 1s, 4s, ...):
  //       const delay = Math.pow(attempt, 2) * 1000
  //       setTimeout(() => {
  //         patronCanPlaceTestHold(patronId, attempt + 1)
  //           .then(resolve)
  //           .catch(reject)
  //       }, delay)
  //     })
  //   })
}

function handleEligible () {
  return { eligibility: true }
}

async function getPatronInfo (patronId) {
  logger.debug(`Fetching patron info for ${patronId}`)
  // wrapper.apiGet does not always return a Promise, so just use callback interface:
  try {
    const response = await wrapper.get(`patrons/${patronId}`)
    logger.debug(`Fetched patron info for ${patronId}`)
    return response
  } catch (e) {
    logger.error('error getting patron info: ', errorBibReq)
    reject(new ParameterError(`Could not get patron info for patron ${patronId}`))
  }
  // return new Promise((resolve, reject) => {
  //   wrapper.apiGet(`patrons/${patronId}`, (errorBibReq, results) => {
  //     if (errorBibReq) {
  //       logger.error('error getting patron info: ', errorBibReq)
  //       reject(new ParameterError(`Could not get patron info for patron ${patronId}`))
  //     }

  //     logger.debug(`Fetched patron info for ${patronId}`)
  //     return resolve(results)
  //   })
  // })
}

async function getPatronHoldsCount (patronId) {
  logger.debug(`Fetching patron holds count for ${patronId}`)
  try {
    const response = await wrapper.get(`patrons/${patronId}/holds`)
    logger.debug(`Fetched patron holds count for ${patronId}`)
    return response.data.entries[0].total
  } catch (e) {
    logger.error('error getting patron holds count: ', errorBibReq)
    // not sure how to incorporate this:
    // new ParameterError(`Could not get holds count for patron ${patronId}`)
  }
  // return new Promise((resolve, reject) => {
  //   wrapper.apiGet(`patrons/${patronId}/holds`, (errorBibReq, results) => {
  //     if (errorBibReq) {
  //       logger.error('error getting patron holds count: ', errorBibReq)
  //       reject(new ParameterError(`Could not get holds count for patron ${patronId}`))
  //     }

  //     logger.debug(`Fetched patron holds count for ${patronId}`)
  //     return resolve(results.data.entries[0].total)
  //   })
  // })
}

/**
 *  Given an patron-info hash (i.e. one retrieved via patrons/{patronId}),
 *  returns a Hash with the following boolean properties:
 *   - expired: True if card expird
 *   - blocked: True if card has blocks
 *   - moneyOwed: True if card has > $15 fines
 *   - ptypeDisallowsHolds: True if patron ptype disallows holds (e.g. ptype 120, 121)
 */
function identifyPatronIssues (info, holdsCount) {
  info = info.data.entries[0]
  const issues = {
    expired: new Date(info.expirationDate) < new Date(),
    blocked: info.blockInfo.code !== '-', // will want to change this once we have a list of block codes
    moneyOwed: info.moneyOwed > 15, // may want to change this
    ptypeDisallowsHolds: ptypeDisallowsHolds(info.patronType),
    reachedHoldLimit: holdsCount >= process.env.HOLDS_LIMIT
  }

  // Set a single property to check for consumers that don't care *what* issues
  // there are but only that there are issues:
  issues.hasIssues = Object.values(issues).some((v) => v)

  return issues
}

function patronPtypeAllowsHolds (info) {
  return !identifyPatronIssues(info).ptypeDisallowsHolds
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
  const config = { 'base': process.env.SIERRA_BASE }
  return Promise.all([
    setConfigValue(config, 'SIERRA_KEY', 'key'),
    setConfigValue(config, 'SIERRA_SECRET', 'secret')
  ])
    .then(values => wrapper.config(config))
}

async function sierraLogin () {
  logger.debug('Performing Sierra login')
  try {
    await wrapper.authenticate()
    logger.debug('Sierra login successful')
  } catch (e) {
    logger.error('Error logging into Sierra: ' + e)
    throw new SierraError(e)
  }
}

/**
 *  CheckEligibility
 *  This is the primary method in this module.
 *
 *  @param {int} patronId The id patron for whom we wish to determine
 *         hold-request eligibility.
 *
 *  @return {Promise<Hash>} A Promise that resolves a hash with a single
 *          `eligible` property (boolean) indicating hold-request eligibility.
 *
 *  This method checks hold-request eligibility by performing two initial checks in parallel:
 *   1. Can patron place a test hold on a fake item?
 *   2. Does patron's ptype allow them to place holds?
 */
function checkEligibility (patronId) {
  let patronInfo = null
  return config()
    .then(sierraLogin)
    .then(() => Promise.all([
      // Attempt a test hold:
      patronCanPlaceTestHold(patronId),
      // Simultaneously fetch patron info:
      getPatronInfo(patronId)
        .then((_patronInfo) => {
          // Save patronInfo for later:
          patronInfo = _patronInfo
          // Determine whether/not ptype allowed to place holds:
          return patronPtypeAllowsHolds(patronInfo)
        }),
      getPatronHoldsCount(patronId)
    ])).then((checks) => {
      const [canPlaceTestHold, ptypeAllowsHolds, holdsCount] = checks
      const eligible = canPlaceTestHold && ptypeAllowsHolds

      logger.debug(`Result of checks is ${canPlaceTestHold} && ${ptypeAllowsHolds}`)

      if (eligible) {
        return handleEligible()
      } else {
        const issues = identifyPatronIssues(patronInfo, holdsCount)
        if (issues.hasIssues) {
          return handlePatronIneligible(issues)
        } else {
          return handlePatronIneligible()
        }
      }
    }).then((result) => {
      logger.info(`CheckEligibility result for patron ${patronId}: ${result.eligibility}`, result)
      return result
    }).catch((e) => {
      logger.error(`CheckEligibility encountered error for patron ${patronId}: `, e)
      throw e
    })
}

module.exports = {
  checkEligibility,
  ptypeDisallowsHolds,
  identifyPatronIssues,
  getPatronHoldsCount
}
