import type { Dataset, DatasetId } from "@agentic-csv/domain";

export interface DatasetRepository {
  save(dataset: Dataset): Promise<void>;
  findById(id: DatasetId): Promise<Dataset | null>;
}
