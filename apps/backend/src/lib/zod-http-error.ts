import type { FastifyReply } from "fastify";
import type { z } from "zod";

/** Additive validation payload: keeps `error` + `details` for existing clients, adds `message` + string `fieldErrors`. */
export function sendZodValidation(reply: FastifyReply, error: z.ZodError) {
  const flat = error.flatten();
  const fieldErrorsRecord = flat.fieldErrors as Record<string, string[] | undefined>;
  const fieldErrors: Record<string, string> = {};
  for (const [key, messages] of Object.entries(fieldErrorsRecord)) {
    const first = messages?.[0];
    if (first) fieldErrors[key] = first;
  }
  return reply.code(400).send({
    error: "validation_error",
    message: "Validation failed",
    fieldErrors,
    details: flat,
  });
}
