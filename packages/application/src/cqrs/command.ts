export interface Command<TResult = unknown> {
  readonly type: string;
  readonly correlationId: string;
  readonly __result?: TResult;
}

export interface CommandHandler<TCommand extends Command<TResult>, TResult> {
  execute(command: TCommand): Promise<TResult>;
}

export interface CommandBus {
  register<TCommand extends Command<TResult>, TResult>(
    type: TCommand["type"],
    handler: CommandHandler<TCommand, TResult>
  ): void;

  execute<TCommand extends Command<TResult>, TResult>(
    command: TCommand
  ): Promise<TResult>;
}
