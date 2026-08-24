import type { PrivacyDeletionScope, PrivacyDeletionStatus } from "@agentic-csv/contracts";

export interface PrivacyDeletionView {
  readonly id: string;
  readonly userId: string;
  readonly scope: PrivacyDeletionScope;
  readonly datasetId: string | null;
  readonly status: PrivacyDeletionStatus;
  readonly requestedAt: Date;
}

export interface PrivacyDeletionWork extends PrivacyDeletionView {
  readonly objectKeys: readonly string[];
}

export interface PrivacyDeletionRepository {
  scheduleDataset(input: {
    readonly deletionId: string;
    readonly userId: string;
    readonly datasetId: string;
    readonly clientRequestId: string;
    readonly correlationId: string;
    readonly requestedAt: Date;
  }): Promise<PrivacyDeletionView | null>;
  scheduleAccount(input: {
    readonly deletionId: string;
    readonly userId: string;
    readonly clientRequestId: string;
    readonly correlationId: string;
    readonly requestedAt: Date;
  }): Promise<PrivacyDeletionView>;
  claim(input: {
    readonly deletionId: string;
    readonly userId: string;
    readonly claimedAt: Date;
  }): Promise<PrivacyDeletionWork | null>;
  complete(input: {
    readonly deletionId: string;
    readonly userId: string;
    readonly completedAt: Date;
  }): Promise<void>;
  recordFailure(input: {
    readonly deletionId: string;
    readonly userId: string;
    readonly failureCode: string;
    readonly failedAt: Date;
  }): Promise<void>;
}

export interface PrivacyEphemeralPurger {
  deleteDataset(input: {
    readonly userId: string;
    readonly datasetId: string;
  }): Promise<void>;
  deleteUser(userId: string): Promise<void>;
}
