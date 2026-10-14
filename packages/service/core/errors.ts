// A record the caller asked for does not exist
class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

// The input, or the current state of a record, does not allow the operation.
// The message says why and is safe to show to the user.
class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export { NotFoundError, ValidationError }
