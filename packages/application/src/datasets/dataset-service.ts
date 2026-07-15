import type {
  DatasetDetailView,
  DatasetProfileView,
  DatasetReadRepository
} from "./ports";
import { DatasetWorkflowError } from "./workflow-error";

export class DatasetService {
  public constructor(private readonly repository: DatasetReadRepository) {}

  public list(userId: string, limit: number) {
    return this.repository.list(userId, limit);
  }

  public async getDetail(userId: string, datasetId: string): Promise<DatasetDetailView> {
    const dataset = await this.repository.getDetail(userId, datasetId);
    if (!dataset) throw notFound();
    return dataset;
  }

  public async getProfile(
    userId: string,
    datasetId: string,
    datasetVersionId: string
  ): Promise<DatasetProfileView> {
    const detail = await this.repository.getDetail(userId, datasetId);
    if (!detail || !detail.versions.some((version) => version.id === datasetVersionId)) {
      throw notFound();
    }
    const profile = await this.repository.getProfile(userId, datasetId, datasetVersionId);
    if (!profile) {
      throw new DatasetWorkflowError(
        "DATASET_PROFILE_NOT_READY",
        "The dataset profile is not ready yet."
      );
    }
    return profile;
  }
}

function notFound(): DatasetWorkflowError {
  return new DatasetWorkflowError("DATASET_NOT_FOUND", "Dataset was not found.");
}
