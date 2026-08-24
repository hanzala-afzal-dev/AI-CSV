import {
  privacyDeletionReceiptSchema,
  type PrivacyDeletionReceipt
} from "@agentic-csv/contracts";
import { authenticatedMutation } from "@/features/identity/api";

interface Envelope {
  readonly data: { readonly deletion: unknown };
}

export async function deleteDataset(
  datasetId: string,
  currentPassword: string
): Promise<PrivacyDeletionReceipt> {
  const response = await authenticatedMutation<Envelope>(
    `/api/v1/datasets/${datasetId}`,
    "DELETE",
    { currentPassword, clientRequestId: crypto.randomUUID() }
  );
  return privacyDeletionReceiptSchema.parse(response.data.deletion);
}

export async function deleteAccount(
  currentPassword: string,
  confirmation: string
): Promise<PrivacyDeletionReceipt> {
  const response = await authenticatedMutation<Envelope>("/api/v1/me", "DELETE", {
    currentPassword,
    confirmation,
    clientRequestId: crypto.randomUUID()
  });
  return privacyDeletionReceiptSchema.parse(response.data.deletion);
}
