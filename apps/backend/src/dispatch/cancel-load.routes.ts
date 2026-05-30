import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { CancelReasonCodeSchema, CancelReasonSchema } from "./load.shared.js";

const cancelRouteParamsSchema = z.object({
  id: z.string().uuid(),
});

function buildLegacyCancellationNotes(cancelReason: string): string {
  if (cancelReason.length >= 20) return cancelReason;
  return `${cancelReason} (provided via cancel reason)`;
}

function sendMissingField(reply: FastifyReply, field: "cancel_reason" | "cancel_reason_code") {
  return reply.code(400).send({
    error: "validation_error",
    details: {
      field,
      message: `${field} is required`,
    },
  });
}

export async function registerDispatchCancelLoadRoutes(app: FastifyInstance) {
  app.addHook("preValidation", async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.method !== "POST") return;
    const url = req.raw.url ?? "";
    const pathname = url.split("?")[0] ?? "";
    const matched = /^\/api\/v1\/dispatch\/loads\/([^/]+)\/cancel$/.exec(pathname);
    if (!matched) return;

    const paramsParsed = cancelRouteParamsSchema.safeParse({ id: matched[1] });
    if (!paramsParsed.success) return;

    const bodyRecord =
      typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};

    const parsedReason = CancelReasonSchema.safeParse(bodyRecord.cancel_reason);
    if (!parsedReason.success) return sendMissingField(reply, "cancel_reason");

    const parsedCode = CancelReasonCodeSchema.safeParse(bodyRecord.cancel_reason_code);
    if (!parsedCode.success) return sendMissingField(reply, "cancel_reason_code");

    const legacyNotes =
      typeof bodyRecord.cancellation_notes === "string" && bodyRecord.cancellation_notes.trim().length > 0
        ? bodyRecord.cancellation_notes.trim()
        : buildLegacyCancellationNotes(parsedReason.data);

    req.body = {
      ...bodyRecord,
      cancel_reason: parsedReason.data,
      cancel_reason_code: parsedCode.data,
      reason_code: parsedCode.data,
      cancellation_notes: legacyNotes,
    };
  });
}
