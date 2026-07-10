import { and, eq } from "drizzle-orm";
import type {
  ApplicationTransaction,
  DatasetRepository,
  DatasetUploadIntent,
  EventPublisher,
  IdempotencyRepository,
  IdempotencyReservation,
  IngestionRequestPublisher,
  UnitOfWork,
  UploadIntentRepository
} from "@agentic-csv/application";
import { Dataset, DatasetId, type DomainEvent } from "@agentic-csv/domain";
import {
  datasetUploadIntents,
  datasets,
  idempotencyRecords,
  outboxEvents
} from "../../drizzle/schema";
import type { DatabaseClient } from "./client";

type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];
type DatabaseExecutor = DatabaseClient | DatabaseTransaction;

class DrizzleDatasetRepository implements DatasetRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async save(dataset: Dataset): Promise<void> {
    const props = dataset.toPrimitives();
    await this.database
      .insert(datasets)
      .values({
        id: props.id.toString(),
        ownerId: props.ownerId,
        name: props.name,
        originalFilename: props.originalFilename,
        objectKey: props.objectKey,
        status: props.status,
        rowCount: props.rowCount,
        columnCount: props.columnCount,
        failureReason: props.failureReason,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt
      })
      .onConflictDoUpdate({
        target: datasets.id,
        set: {
          name: props.name,
          originalFilename: props.originalFilename,
          objectKey: props.objectKey,
          status: props.status,
          rowCount: props.rowCount,
          columnCount: props.columnCount,
          failureReason: props.failureReason,
          updatedAt: props.updatedAt
        }
      });
  }

  public async findById(id: DatasetId): Promise<Dataset | null> {
    const rows = await this.database
      .select()
      .from(datasets)
      .where(eq(datasets.id, id.toString()))
      .limit(1);
    return rows[0] ? mapDataset(rows[0]) : null;
  }

  public async findByIdForOwner(
    id: DatasetId,
    ownerId: string,
    options?: { readonly forUpdate?: boolean }
  ): Promise<Dataset | null> {
    const condition = and(eq(datasets.id, id.toString()), eq(datasets.ownerId, ownerId));
    const rows = options?.forUpdate
      ? await this.database
          .select()
          .from(datasets)
          .where(condition)
          .limit(1)
          .for("update")
      : await this.database.select().from(datasets).where(condition).limit(1);
    return rows[0] ? mapDataset(rows[0]) : null;
  }
}

class DrizzleEventPublisher implements EventPublisher {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async publish(events: readonly DomainEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    await this.database.insert(outboxEvents).values(
      events.map((event) => ({
        eventId: event.eventId,
        ownerId: ownerIdFromPayload(event.payload),
        aggregateId: event.aggregateId,
        eventName: event.name,
        payload: event.payload,
        occurredAt: event.occurredAt
      }))
    );
  }
}

class DrizzleUploadIntentRepository implements UploadIntentRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async create(intent: DatasetUploadIntent): Promise<void> {
    await this.database.insert(datasetUploadIntents).values(intent);
  }

  public async findByIdForOwner(
    id: string,
    ownerId: string,
    options?: { readonly forUpdate?: boolean }
  ): Promise<DatasetUploadIntent | null> {
    const condition = and(
      eq(datasetUploadIntents.id, id),
      eq(datasetUploadIntents.ownerId, ownerId)
    );
    const rows = options?.forUpdate
      ? await this.database
          .select()
          .from(datasetUploadIntents)
          .where(condition)
          .limit(1)
          .for("update")
      : await this.database.select().from(datasetUploadIntents).where(condition).limit(1);
    return rows[0] ?? null;
  }

  public async markCompleted(id: string, completedAt: Date): Promise<void> {
    await this.database
      .update(datasetUploadIntents)
      .set({ completedAt })
      .where(eq(datasetUploadIntents.id, id));
  }
}

class DrizzleIdempotencyRepository implements IdempotencyRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async find(input: {
    readonly ownerId: string;
    readonly operation: string;
    readonly key: string;
  }): Promise<IdempotencyReservation | null> {
    const rows = await this.database
      .select({
        requestHash: idempotencyRecords.requestHash,
        response: idempotencyRecords.response,
        completedAt: idempotencyRecords.completedAt
      })
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.ownerId, input.ownerId),
          eq(idempotencyRecords.operation, input.operation),
          eq(idempotencyRecords.key, input.key)
        )
      )
      .limit(1);
    const existing = rows[0];
    return existing
      ? {
          acquired: false,
          requestHash: existing.requestHash,
          response: existing.response,
          completed: existing.completedAt !== null
        }
      : null;
  }

  public async reserve(input: {
    readonly ownerId: string;
    readonly operation: string;
    readonly key: string;
    readonly requestHash: string;
    readonly expiresAt: Date;
  }): Promise<IdempotencyReservation> {
    const inserted = await this.database
      .insert(idempotencyRecords)
      .values(input)
      .onConflictDoNothing()
      .returning({ requestHash: idempotencyRecords.requestHash });
    if (inserted.length > 0) {
      return {
        acquired: true,
        requestHash: input.requestHash,
        response: null,
        completed: false
      };
    }

    const existing = await this.find(input);
    if (!existing) {
      throw new Error("Idempotency reservation disappeared after a conflict.");
    }
    return existing;
  }

  public async complete(input: {
    readonly ownerId: string;
    readonly operation: string;
    readonly key: string;
    readonly response: unknown;
    readonly completedAt: Date;
  }): Promise<void> {
    await this.database
      .update(idempotencyRecords)
      .set({ response: input.response, completedAt: input.completedAt })
      .where(
        and(
          eq(idempotencyRecords.ownerId, input.ownerId),
          eq(idempotencyRecords.operation, input.operation),
          eq(idempotencyRecords.key, input.key)
        )
      );
  }
}

class DrizzleIngestionRequestPublisher implements IngestionRequestPublisher {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async publish(payload: {
    readonly schemaVersion: 1;
    readonly jobName: "dataset.ingest.v1";
    readonly correlationId: string;
    readonly ownerId: string;
    readonly datasetId: string;
    readonly objectKey: string;
    readonly idempotencyKey: string;
  }): Promise<void> {
    await this.database.insert(outboxEvents).values({
      ownerId: payload.ownerId,
      aggregateId: payload.datasetId,
      eventName: "queue.dataset.ingest.v1",
      payload,
      occurredAt: new Date()
    });
  }
}

export class DrizzleUnitOfWork implements UnitOfWork {
  public constructor(private readonly database: DatabaseClient) {}

  public execute<TResult>(
    work: (transaction: ApplicationTransaction) => Promise<TResult>
  ): Promise<TResult> {
    return this.database.transaction((databaseTransaction) =>
      work(createTransactionContext(databaseTransaction))
    );
  }
}

function createTransactionContext(database: DatabaseExecutor): ApplicationTransaction {
  return {
    datasets: new DrizzleDatasetRepository(database),
    events: new DrizzleEventPublisher(database),
    uploadIntents: new DrizzleUploadIntentRepository(database),
    idempotency: new DrizzleIdempotencyRepository(database),
    ingestionRequests: new DrizzleIngestionRequestPublisher(database)
  };
}

function mapDataset(row: typeof datasets.$inferSelect): Dataset {
  return Dataset.rehydrate({
    id: DatasetId.from(row.id),
    ownerId: row.ownerId,
    name: row.name,
    originalFilename: row.originalFilename,
    objectKey: row.objectKey,
    status: row.status,
    rowCount: row.rowCount,
    columnCount: row.columnCount,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });
}

function ownerIdFromPayload(payload: unknown): string | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "ownerId" in payload &&
    typeof payload.ownerId === "string"
  ) {
    return payload.ownerId;
  }
  return null;
}
