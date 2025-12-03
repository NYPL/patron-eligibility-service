const { KMSClient, DecryptCommand } = require('@aws-sdk/client-kms')

async function decrypt (encrypted) {
  const config = {
    region: process.env.AWS_REGION || 'us-east-1'
  }
  const client = new KMSClient(config)
  const input = {
    CiphertextBlob: Buffer.from(encrypted, 'base64')
  }
  const command = new DecryptCommand(input)
  const response = await client.send(command)

  const decrypted = new TextDecoder('utf-8').decode(response.Plaintext)
  return decrypted
}

function decryptNyplOauthSecret () {
  if (!process.env.NYPL_OAUTH_SECRET) throw new Error('Missing NYPL_OAUTH_SECRET env variable; aborting.')

  const encrypted = process.env.NYPL_OAUTH_SECRET
  return decrypt(encrypted)
}

module.exports = { decrypt, decryptNyplOauthSecret }
