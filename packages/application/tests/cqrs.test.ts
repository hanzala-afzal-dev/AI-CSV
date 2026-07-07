import { describe, expect, it } from "vitest";
import {
  CqrsHandlerAlreadyRegisteredError,
  CqrsHandlerMissingError,
  InMemoryCommandBus
} from "../src";
import type { Command, CommandHandler } from "../src";

interface PingResult {
  readonly ok: true;
}

interface PingCommand extends Command<PingResult> {
  readonly type: "ping.v1";
}

const pingHandler: CommandHandler<PingCommand, PingResult> = {
  async execute(): Promise<PingResult> {
    return { ok: true };
  }
};

describe("InMemoryCommandBus", () => {
  it("rejects duplicate handler registration", () => {
    const bus = new InMemoryCommandBus();
    bus.register("ping.v1", pingHandler);

    expect(() => bus.register("ping.v1", pingHandler)).toThrow(
      CqrsHandlerAlreadyRegisteredError
    );
  });

  it("fails clearly when a handler is missing", async () => {
    const bus = new InMemoryCommandBus();

    await expect(
      bus.execute<PingCommand, PingResult>({
        type: "ping.v1",
        correlationId: "corr_1"
      })
    ).rejects.toThrow(CqrsHandlerMissingError);
  });

  it("executes a registered handler", async () => {
    const bus = new InMemoryCommandBus();
    bus.register("ping.v1", pingHandler);

    await expect(
      bus.execute<PingCommand, PingResult>({
        type: "ping.v1",
        correlationId: "corr_1"
      })
    ).resolves.toEqual({ ok: true });
  });
});
