const dotenv = require('dotenv')
const kmsHelper = require('./kms-helper')

const argv = require('minimist')(process.argv.slice(2))

if (!argv.profile) throw new Error('--profile [aws profile] is a required flag')
if (!argv.envfile) throw new Error('--envfile config/[environment].env is a required flag')

// Load nypl-data-api-client required config:
dotenv.config({ path: argv.envfile })

// Set active aws profile (so that kms knows how to decrypt things)
kmsHelper.setProfile(argv.profile)
