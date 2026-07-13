import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform((value) => value.normalize("NFKC").toLowerCase());
const passwordSchema = z
  .string()
  .min(12, "Password must contain at least 12 characters.")
  .max(128, "Password must contain no more than 128 characters.");
const displayNameSchema = z.string().trim().min(2).max(160);
const opaqueTokenSchema = z.string().min(32).max(512);

export const registerRequestSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  password: passwordSchema
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128)
});

export const emailRequestSchema = z.object({ email: emailSchema });
export const tokenRequestSchema = z.object({ token: opaqueTokenSchema });

export const passwordResetConfirmRequestSchema = z.object({
  token: opaqueTokenSchema,
  newPassword: passwordSchema
});

export const profileUpdateRequestSchema = z.object({ displayName: displayNameSchema });

export const emailChangeRequestSchema = z.object({
  email: emailSchema,
  currentPassword: z.string().min(1).max(128)
});

export const passwordChangeRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema
});

export const safeUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  pendingEmail: z.string().email().nullable(),
  displayName: z.string(),
  emailVerified: z.boolean()
});

export const sessionIdSchema = z.string().uuid();

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type SafeUser = z.infer<typeof safeUserSchema>;
