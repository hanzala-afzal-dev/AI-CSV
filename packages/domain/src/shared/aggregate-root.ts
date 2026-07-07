import type { DomainEvent } from "./domain-event";

export abstract class AggregateRoot {
  private readonly events: DomainEvent[] = [];

  protected record(event: DomainEvent): void {
    this.events.push(event);
  }

  public pullDomainEvents(): DomainEvent[] {
    const events = [...this.events];
    this.events.length = 0;
    return events;
  }

  public peekDomainEvents(): readonly DomainEvent[] {
    return this.events;
  }
}
