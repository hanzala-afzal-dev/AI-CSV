import type { PrivacyDeletionView } from "@agentic-csv/application";
import {
  privacyDeletionReceiptSchema,
  type PrivacyDeletionReceipt
} from "@agentic-csv/contracts";

export function safePrivacyDeletion(
  deletion: PrivacyDeletionView
): PrivacyDeletionReceipt {
  return privacyDeletionReceiptSchema.parse({
    version: 1,
    deletionId: deletion.id,
    scope: deletion.scope,
    datasetId: deletion.datasetId,
    status: deletion.status,
    requestedAt: deletion.requestedAt.toISOString()
  });
}
