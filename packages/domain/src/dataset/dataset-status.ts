export const datasetStatuses = [
  "pending_upload",
  "uploaded",
  "profiling",
  "ready",
  "failed",
  "deleting",
  "deleted"
] as const;

export type DatasetStatus = (typeof datasetStatuses)[number];
