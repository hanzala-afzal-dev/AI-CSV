import { z } from "zod";
import { datasetStatusSchema } from "./dataset";

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  requestId: z.string().min(1),
  details: z.record(z.string(), z.unknown())
});

export const apiSuccessEnvelopeSchema = <TData extends z.ZodType>(data: TData) =>
  z.object({
    ok: z.literal(true),
    data,
    correlationId: z.string().min(1)
  });

export const apiErrorEnvelopeSchema = z.object({
  error: apiErrorSchema
});

export const datasetApiRepresentationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1),
  name: z.string().min(1).max(120),
  originalFilename: z.string().min(1),
  objectKey: z.string().min(1).nullable(),
  status: datasetStatusSchema,
  rowCount: z.number().int().nonnegative().nullable(),
  columnCount: z.number().int().positive().nullable(),
  failureReason: z.string().min(1).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;
export type DatasetApiRepresentation = z.infer<typeof datasetApiRepresentationSchema>;
