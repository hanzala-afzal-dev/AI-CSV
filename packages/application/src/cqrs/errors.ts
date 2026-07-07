export class CqrsHandlerAlreadyRegisteredError extends Error {
  public constructor(type: string) {
    super(`A CQRS handler is already registered for '${type}'.`);
    this.name = "CqrsHandlerAlreadyRegisteredError";
  }
}

export class CqrsHandlerMissingError extends Error {
  public constructor(type: string) {
    super(`No CQRS handler is registered for '${type}'.`);
    this.name = "CqrsHandlerMissingError";
  }
}
