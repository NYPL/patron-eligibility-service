# NYPL Patron Eligibility Service

This package is intended to be used as a Lambda-based Node.js service.

## Requirements

* Node.js >= 6.10

## Installation
1. Clone to Repo
2. Install required dependencies.
  * Run npm install to install Node.js packages
  * If you have not already installed node-lambda as a global package, run `npm install -g node-lambda`
3. Copy the `config/development.env.sample` file to `config/development.env`
4. Replace sample values in `config/development.env`. These should be encrypted (see instructions on AWS encryption below)

## Configuration
`config/development.env` is used to set Sierra credentials

## Usage
### Process a Lambda event?
### Run as a Web server

Run `node app-local.js --envfile config/development.env --profile [profile]`

You can then make a request to `http://localhost:3003/api/v0.1/patrons/:id/hold-request-eligibility`

## Testing
The test suite uses lambda-tester to run tests against the handler interface.
`npm test`

## Deployment
Deployment is even better

## Encryption
To encrypt a plaintext secret:

* Look up the account's KMS encryption key ARN:
  - Log into sandbox if you're encrypting a qa key, nypl-digital-dev if you're encrypting a production key
  - IAM > Encryption Keys > lambda-default (or 'lambda-rds' in sandbox)
  - Copy ARN

* AWS\_DEFAULT\_REGION=us-east-1 aws kms encrypt --key-id "[encryption key arn]" --plaintext "[plaintext secret]"

For further information on encryption and decryption in the command line see: [Secrets Management](https://github.com/NYPL/engineering-general/blob/master/security/secrets.md)
