class SierraError extends Error {
  constructor (message) {
    super(message)
    this.name = 'SierraError'
  }
}

class ParameterError extends Error {
  constructor (message) {
    super(message)
    this.name = 'ParameterError'
  }
}

module.exports = {
  SierraError,
  ParameterError
}
