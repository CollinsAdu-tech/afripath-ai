export class InputValidationError extends Error {
  constructor(details) {
    super('The request contains invalid answers.');
    this.name = 'InputValidationError';
    this.code = 'INVALID_INPUT';
    this.details = details; // [{field, code, message}]
  }
}

export class CareerNotFoundError extends Error {
  constructor(careerId) {
    super(`No career with id "${String(careerId).slice(0, 80)}" exists in the knowledge base.`);
    this.name = 'CareerNotFoundError';
    this.code = 'CAREER_NOT_FOUND';
  }
}
