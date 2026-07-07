import type { Query, QueryBus, QueryHandler } from "./query";
import { CqrsHandlerAlreadyRegisteredError, CqrsHandlerMissingError } from "./errors";

type UnknownQuery = Query<unknown>;
type UnknownQueryHandler = QueryHandler<UnknownQuery, unknown>;

export class InMemoryQueryBus implements QueryBus {
  private readonly handlers = new Map<string, UnknownQueryHandler>();

  public register<TQuery extends Query<TResult>, TResult>(
    type: TQuery["type"],
    handler: QueryHandler<TQuery, TResult>
  ): void {
    if (this.handlers.has(type)) {
      throw new CqrsHandlerAlreadyRegisteredError(type);
    }

    this.handlers.set(type, handler as UnknownQueryHandler);
  }

  public async execute<TQuery extends Query<TResult>, TResult>(
    query: TQuery
  ): Promise<TResult> {
    const handler = this.handlers.get(query.type);
    if (!handler) {
      throw new CqrsHandlerMissingError(query.type);
    }

    return (await handler.execute(query)) as TResult;
  }
}
