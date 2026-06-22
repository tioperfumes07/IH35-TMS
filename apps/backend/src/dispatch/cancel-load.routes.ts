import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { CancelReasonSchema } from "./load.shared.js";

const cancelRouteParamsSchema = z.object({
  id: z.string().uuid(),
});

// cancel_reason_code is validated against the catalog (catalogs.cancellation_reasons) DOWNSTREAM by the
// cancelLoad service (it throws E_REASON_NOT_FOUND → 400 for an unknown code). It must NOT be enum-gated
// here: the canonical catalog codes are CUSTOMER_CANCELLED / DRIVER_ISSUE / EQUIPMENT_ISSUE / WEATHER /
// NO_PICKUP / RATE_DISPUTE / CUSTOMER_BANKRUPTCY / TRUCK_BREAKDOWN / DRIVER_WALKOFF (migration 0101), which
// are exactly what the frontend dropdown (also catalog-driven) submits. The previous hard-coded enum
// (customer_request / no_truck_available / hos_violation / …) matched NEITHER the catalog NOR the dropdown,
// so EVERY real cancel 400'd with "cancel_reason_code is required". Accept any non-empty code; the catalog
// is the single source of truth for which codes are valid.
const cancelReasonCodeInputSchema = z.string().trim().min(1).max(100);

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

    const parsedCode = cancelReasonCodeInputSchema.safeParse(bodyRecord.cancel_reason_code);
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
