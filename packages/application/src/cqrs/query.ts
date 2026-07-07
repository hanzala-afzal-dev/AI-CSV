export interface Query<TResult = unknown> {
  readonly type: string;
  readonly correlationId: string;
  readonly __result?: TResult;
}

export interface QueryHandler<TQuery extends Query<TResult>, TResult> {
  execute(query: TQuery): Promise<TResult>;
}

export interface QueryBus {
  register<TQuery extends Query<TResult>, TResult>(
    type: TQuery["type"],
    handler: QueryHandler<TQuery, TResult>
  ): void;

  execute<TQuery extends Query<TResult>, TResult>(query: TQuery): Promise<TResult>;
}
