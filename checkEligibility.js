const wrapper = require('@nypl/sierra-wrapper')
const nyplCoreObjects = require('@nypl/nypl-core-objects')
const logger = require('./logger')
const kms = require('./lib/kms-helper')
const { SierraError, ParameterError } = require('./lib/errors')

async function patronCanPlaceTestHold (patronId, firstAttempt = true) {
  logger.debug('Performing patronCanPlaceTestHold')
  const body = {
    recordType: 'i',
    recordNumber: 10000000,
    pickupLocation: 'maii2'
  }
  // This try/catch block logic is inverted. The success case of this request results in an error, and the failure case results in a typical response.
  let patronHoldsPossible
  let response
  try {
    response = await wrapper.post(`patrons/${patronId}/holds/requests`, body)
    logger.error('Error: Placing a test hold on a test item did not generate an error!')
    return false
  } catch (e) {
    // catch empty response from Sierra
    if (!e.response) {
      // don't want to try post requests more than once
      if (firstAttempt) {
        logger.info('Retrying patronCanPlaceTestHold - empty Sierra response')
        return await patronCanPlaceTestHold(patronId, false)
        // second empty response triggers hard error
      } else {
        logger.info('Received two empty responses from Sierra. Returning true for eligibility')
        return true
      }
    } else {
      const { description, name } = e.response.data
      patronHoldsPossible = (
        description.includes('Bib record cannot be loaded')
      ) && (
        name === 'XCirc error' || description.includes('XCirc error')
      )

      if (patronHoldsPossible) {
        response = e.response.data
        return true
      } else {
        logger.debug(`Recieved error from sierra indicating patron holds are not possible for patron ${patronId}: ${JSON.stringify(e.response.data)}`)
      }
    }
  } finally {
    logger.debug(`Finished performing patronCanPlaceTestHold with ${patronHoldsPossible ? 'favorable' : 'unfavorable'} response`, response)
  }
}

function handleEligible () {
  return { eligibility: true }
}

async function getPatronInfo (patronId) {
  logger.debug(`Fetching patron info for ${patronId}`)
  // wrapper.apiGet does not always return a Promise, so just use callback interface:
  try {
    const response = await wrapper.get(`patrons/${patronId}?fields=id,expirationDate,patronType,moneyOwed,blockInfo`)
    logger.debug(`Fetched patron info for ${patronId}`)
    return response
  } catch (e) {
    logger.error('error getting patron info: ', e)
    throw new ParameterError(`Could not get patron info for patron ${patronId}`)
  }
}

async function getPatronHoldsCount (patronId) {
  logger.debug(`Fetching patron holds count for ${patronId}`)
  try {
    const response = await wrapper.get(`patrons/${patronId}/holds`)
    logger.debug(`Fetched patron holds count for ${patronId}`)
    return response.total
  } catch (e) {
    logger.error('error getting patron holds count: ', e)
  }
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
  let issues
  if (patronRecordComplete(info)) {
    issues = {
      expired: new Date(info.expirationDate) < new Date(),
      blocked: info.blockInfo.code !== '-', // will want to change this once we have a list of block codes
      moneyOwed: info.moneyOwed > 15, // may want to change this
      ptypeDisallowsHolds: ptypeDisallowsHolds(info.patronType),
      reachedHoldLimit: holdsCount >= process.env.HOLDS_LIMIT
    }
  } else {
    issues = {
      patronRecordIncomplete: true
    }
  }

  // Set a single property to check for consumers that don't care *what* issues
  // there are but only that there are issues:
  issues.hasIssues = Object.values(issues).some((v) => v)

  return issues
}

function patronRecordComplete (info) {
  const necessaryProps = ['expirationDate', 'blockInfo', 'moneyOwed']
  return necessaryProps.every(prop => Object.keys(info).includes(prop)) === true
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

  // If it's a newly added ptype not in nypl-core, assume it allows holds:
  if (!ptypeMapping[ptype]) {
    logger.debug(`Ptype not found: ${ptype}. Assuming that ptype allows holds.`)
    return false
  }
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
  const config = { base: process.env.SIERRA_BASE }
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
      const eligible = canPlaceTestHold && ptypeAllowsHolds && patronRecordComplete(patronInfo)

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
  getPatronHoldsCount,
  patronCanPlaceTestHold
}
