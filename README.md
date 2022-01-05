# NYPL Patron Eligibility Service

This package is intended to be used as a Lambda-based Node.js service.

## Purpose

This app serves `GET /api/v0.1/patrons/:patronid/hold-request-eligibility`. The endpoint assesses whether or not the patron identified by `patronid` is eligible to place holds on research items. The response resembles:

```
{ "eligibility": true|false }
```

The following conditions make one *ineligible*:

 - ptype bars holds (e.g. ptype 120)
 - fines exceed $15
 - patron record has blocks
 - patron has expired card
 - some other condition causes checkouts to fail (e.g. patron has maximum checkouts)

If none of the above conditions are met, the patron will be considered *eligible*.

## Installation

Set Node version:

```
nvm use
```

Install dependencies:

```
npm i
```

## Running locally

Run `node app-local.js --envfile config/development.env --profile [profile]`

You can then make a request to `http://localhost:3003/api/v0.1/patrons/:id/hold-request-eligibility`

## Testing

Run all unit tests:

`npm test`

## Contributing

This repo uses the [Development-QA-Main Git Workflow](https://github.com/NYPL/engineering-general/blob/master/standards/git-workflow.md#development-qa-main).

## Deployment

Travis CI is configured to run our build and deployment process on AWS. Updates to `qa` deploy to our QA deployment. Updates to `main` deploy to our Production deployment.
