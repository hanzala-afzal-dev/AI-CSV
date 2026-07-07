import { z } from "zod";

export const datasetStatusSchema = z.enum([
  "pending_upload",
  "uploaded",
  "profiling",
  "ready",
  "failed"
]);

export const createDatasetRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  originalFilename: z.string().trim().min(1).max(255)
});

export type DatasetStatusContract = z.infer<typeof datasetStatusSchema>;
export type CreateDatasetRequest = z.infer<typeof createDatasetRequestSchema>;
