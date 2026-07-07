import type { Command, CommandBus, CommandHandler } from "./command";
import { CqrsHandlerAlreadyRegisteredError, CqrsHandlerMissingError } from "./errors";

type UnknownCommand = Command<unknown>;
type UnknownCommandHandler = CommandHandler<UnknownCommand, unknown>;

export class InMemoryCommandBus implements CommandBus {
  private readonly handlers = new Map<string, UnknownCommandHandler>();

  public register<TCommand extends Command<TResult>, TResult>(
    type: TCommand["type"],
    handler: CommandHandler<TCommand, TResult>
  ): void {
    if (this.handlers.has(type)) {
      throw new CqrsHandlerAlreadyRegisteredError(type);
    }

    this.handlers.set(type, handler as UnknownCommandHandler);
  }

  public async execute<TCommand extends Command<TResult>, TResult>(
    command: TCommand
  ): Promise<TResult> {
    const handler = this.handlers.get(command.type);
    if (!handler) {
      throw new CqrsHandlerMissingError(command.type);
    }

    return (await handler.execute(command)) as TResult;
  }
}
