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

### Run as a Web server

Run `node app-local.js --envfile config/development.env --profile [profile]`

You can then make a request to `http://localhost:3003/api/v0.1/patrons/:id/hold-request-eligibility`

## Testing
The test suite uses lambda-tester to run tests against the handler interface.
`npm test`

## Deployment

Three deploy scripts are registered in `package.json`:
`npm run deploy-[development|qa|production]`

Travis CI is configured to run our build and deployment process on AWS.

Our Travis CI/CD pipeline will execute the following steps for each deployment trigger:
* Run unit test coverage
* Build Lambda deployment packages
* Execute the`deploy` hook for `development`, `qa`, or `master`
* Developers do not need to manually deploy the application if Travis is successful

## Git Workflow
We use three branches for deployment: `development`, `qa`, `master`.

If we have a new feature to add, the suggested workflow is:
- Create branch for new feature `git checkout -b new-feature` off the `development` branch.
- Create Pull Request pointing to the `development` branch.
- To test the branch on the development server, follow the instructions below for deploying to Development
- Once the Pull Request is accepted merge it into `development`
- Update version in `development` branch:
  - Decide on appropriate new version number
  - Add notes to CHANGELOG.md & update `package.json` version number. Commit.
  - `git push origin development`
- Eventually merge `development` into `qa`
- Eventually merge `qa` into `master`
- Add git tag to `master` (e.g. `git tag -a v1.4.3; git push --tags`)

## Encryption
To encrypt a plaintext secret:

* Look up the account's KMS encryption key ARN:
  - Log into sandbox if you're encrypting a qa key, nypl-digital-dev if you're encrypting a production key
  - IAM > Encryption Keys > lambda-default (or 'lambda-rds' in sandbox)
  - Copy ARN

* AWS\_DEFAULT\_REGION=us-east-1 aws kms encrypt --key-id "[encryption key arn]" --plaintext "[plaintext secret]"

For further information on encryption and decryption in the command line see: [Secrets Management](https://github.com/NYPL/engineering-general/blob/master/security/secrets.md)
