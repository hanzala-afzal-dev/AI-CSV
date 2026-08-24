import { randomUUID } from "node:crypto";
import type { PrivacyDeleteJobPayload } from "@agentic-csv/contracts";
import type { ObjectStorage } from "../ports/object-storage";
import type { SemanticVectorStore } from "../memory/ports";
import { PrivacyDeletionError } from "./privacy-error";
import type {
  PrivacyDeletionRepository,
  PrivacyDeletionView,
  PrivacyEphemeralPurger
} from "./ports";

export class PrivacyDeletionService {
  public constructor(
    private readonly repository: PrivacyDeletionRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async scheduleDataset(input: {
    readonly userId: string;
    readonly datasetId: string;
    readonly clientRequestId: string;
    readonly correlationId: string;
  }): Promise<PrivacyDeletionView> {
    const deletion = await this.repository.scheduleDataset({
      ...input,
      deletionId: randomUUID(),
      requestedAt: this.now()
    });
    if (!deletion) {
      throw new PrivacyDeletionError("DATASET_NOT_FOUND", "Dataset was not found.");
    }
    return deletion;
  }

  public scheduleAccount(input: {
    readonly userId: string;
    readonly clientRequestId: string;
    readonly correlationId: string;
  }): Promise<PrivacyDeletionView> {
    return this.repository.scheduleAccount({
      ...input,
      deletionId: randomUUID(),
      requestedAt: this.now()
    });
  }
}

export class PrivacyDeletionProcessor {
  public constructor(
    private readonly repository: PrivacyDeletionRepository,
    private readonly storage: ObjectStorage,
    private readonly vectors: SemanticVectorStore,
    private readonly ephemeral: PrivacyEphemeralPurger,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async process(payload: PrivacyDeleteJobPayload): Promise<void> {
    const work = await this.repository.claim({
      deletionId: payload.deletionId,
      userId: payload.userId,
      claimedAt: this.now()
    });
    if (!work) return;

    try {
      await this.purgeEphemeral(work);
      await this.storage.deleteObjects(unique(work.objectKeys));
      await this.vectors.ensureReady();
      await this.vectors.delete({
        userId: work.userId,
        ...(work.datasetId ? { datasetId: work.datasetId } : {})
      });
      await this.repository.complete({
        deletionId: work.id,
        userId: work.userId,
        completedAt: this.now()
      });
    } catch (error) {
      await this.repository.recordFailure({
        deletionId: work.id,
        userId: work.userId,
        failureCode: safeFailureCode(error),
        failedAt: this.now()
      });
      throw error;
    }
  }

  private purgeEphemeral(input: {
    readonly scope: "dataset" | "account";
    readonly userId: string;
    readonly datasetId: string | null;
  }): Promise<void> {
    if (input.scope === "dataset") {
      if (!input.datasetId) {
        throw new PrivacyDeletionError(
          "DELETION_NOT_FOUND",
          "Dataset deletion state is invalid."
        );
      }
      return this.ephemeral.deleteDataset({
        userId: input.userId,
        datasetId: input.datasetId
      });
    }
    return this.ephemeral.deleteUser(input.userId);
  }
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function safeFailureCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]{1,80}$/.test(error.code)
  ) {
    return error.code;
  }
  return "PRIVACY_DELETION_RETRY";
}
