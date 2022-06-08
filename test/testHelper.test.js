const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const dotenv = require('dotenv')

dotenv.config({ path: './config/test.env' })

require('../app')

chai.use(chaiAsPromised)

global.expect = chai.expect
