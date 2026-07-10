import type { Dataset, DatasetId } from "@agentic-csv/domain";

export interface DatasetRepository {
  save(dataset: Dataset): Promise<void>;
  findById(id: DatasetId): Promise<Dataset | null>;
  findByIdForOwner(
    id: DatasetId,
    ownerId: string,
    options?: { readonly forUpdate?: boolean }
  ): Promise<Dataset | null>;
}
