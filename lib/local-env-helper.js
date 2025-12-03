const dotenv = require('dotenv')

const argv = require('minimist')(process.argv.slice(2))

if (!argv.profile) throw new Error('--profile [aws profile] is a required flag')
if (!argv.envfile) throw new Error('--envfile config/[environment].env is a required flag')

// Load nypl-data-api-client required config:
dotenv.config({ path: argv.envfile })
