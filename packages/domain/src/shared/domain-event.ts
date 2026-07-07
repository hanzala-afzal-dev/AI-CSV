export interface DomainEvent<TName extends string = string, TPayload = unknown> {
  readonly eventId: string;
  readonly aggregateId: string;
  readonly name: TName;
  readonly payload: TPayload;
  readonly occurredAt: Date;
}

export function createDomainEvent<TName extends string, TPayload>(input: {
  aggregateId: string;
  name: TName;
  payload: TPayload;
}): DomainEvent<TName, TPayload> {
  return {
    eventId: crypto.randomUUID(),
    aggregateId: input.aggregateId,
    name: input.name,
    payload: input.payload,
    occurredAt: new Date()
  };
}
