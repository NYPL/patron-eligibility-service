const app = require('./app')
const port = 3003

// Require certain argv params to establish what environment to serve:
require('./lib/local-env-helper')

app.listen(port)
console.log(`listening on http://localhost:${port}`)
