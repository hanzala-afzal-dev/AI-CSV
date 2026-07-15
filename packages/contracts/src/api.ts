import { z } from "zod";

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

export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;
