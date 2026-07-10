import type { Dataset, DatasetId } from "@agentic-csv/domain";

export interface DatasetRepository {
  save(dataset: Dataset): Promise<void>;
  findByIdForUser(
    id: DatasetId,
    userId: string,
    options?: { readonly forUpdate?: boolean }
  ): Promise<Dataset | null>;
}
