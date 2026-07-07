export const datasetStatuses = [
  "pending_upload",
  "uploaded",
  "profiling",
  "ready",
  "failed"
] as const;

export type DatasetStatus = (typeof datasetStatuses)[number];
