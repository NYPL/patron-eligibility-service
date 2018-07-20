var wrapper = require('@nypl/sierra-wrapper')
const decrypt = require('./lib/kms-helper').decrypt

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
  console.log(wrapper)
  return wrapper.apiPost(`patrons/${patronId}/holds/requests`, body, (errorBibReq, results) => {
    if (errorBibReq) {
      return new Promise((resolve, reject) => {
        resolve(errorBibReq.description === 'XCirc error : Bib record cannot be loaded')
      })
    }
  })
}

function handleEligible () {
  return 'eligible to place holds'
}

function getPatronInfo (patronId) {
  return wrapper.apiGet(`patrons/${patronId}`, (errorBibReq, results) => {
    if (errorBibReq) {
      console.log(errorBibReq)
    }
    return new Promise((resolve, reject) => {
      resolve(results)
    })
  })
}

function finesBlocksOrExpiration (info) {
  info = info.data.entries[0]
  return {
    expired: new Date(info.expirationDate) < new Date(),
    blocked: info.blockInfo.code !== '-', // will want to change this once we have a list of block codes
    moneyOwed: info.moneyOwed > 15 // may want to change this
  }
}

function handleFinesBlocksOrExpiration (data) {
  return JSON.stringify(data)
}

function getPatronHolds (patronId) {
  return 'not yet implemented'
}

function config() {
  const config = {'base': process.env.SIERRA_BASE}
    console.log(process.env.SIERRA_KEY)
    return decrypt(process.env.SIERRA_KEY)
      .then((key) => config.key = key)
      .then(() => decrypt(process.env.SIERRA_SECRET))
      .then((secret) => config.secret = secret )
      .then(() => { console.log(config); return wrapper.loadConfig(config)})
}

function checkEligibility (patronId) {
  return config().then(() => {
    return wrapper.promiseAuth((error, results) => {
      if (error) console.log('promiseAuthError', error)
      return new Promise((resolve, reject) => {
        initialCheck(patronId).then((eligible) => {
          if (eligible) {
            resolve(handleEligible())
          } else {
            getPatronInfo(patronId).then((info) => {
              const issues = finesBlocksOrExpiration(info)
              if (issues.expired || issues.blocked || issues.moneyOwed) {
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

exports.checkEligibility = checkEligibility
