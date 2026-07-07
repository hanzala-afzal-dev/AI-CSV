import type { DomainEvent } from "@agentic-csv/domain";

export interface EventPublisher {
  publish(events: readonly DomainEvent[]): Promise<void>;
}
