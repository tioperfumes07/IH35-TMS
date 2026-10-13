import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { QBO_NATIVE_WRITE_REFUSED } from "../qbo-sync/qbo-native-write-refused.js";

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function canAccess(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

const mappingSchema = z.object({
  entity_id: z.string().uuid(),
  qbo_vendor_id: z.string().trim().min(1).max(120).nullable().optional(),
  qbo_class_id: z.string().trim().min(1).max(120).nullable().optional(),
});

const bodySchema = z.object({
  operating_company_id: z.string().uuid(),
  type: z.enum(["drivers", "assets"]),
  mappings: z.array(mappingSchema).min(1).max(500),
});

/**
 * ACCT-F4431381 (443.137 9e last gaps) — QuickBooks is a READ-ONLY ARCHIVE.
 *
 * This route used to UPDATE mdata.drivers / mdata.units / mdata.equipment qbo_vendor_id /
 * qbo_class_id from a bulk QBO mapping payload. The FE review page is already read-only
 * (verify-qbo-bulk-link-uses-paritytable); the POST still accepted writes with no UI caller.
 * Refuse by name — never a silent 0-row success — so a resurrected caller cannot stamp QBO
 * ids onto native master rows.
 */
export async function registerQboBulkLinkRoutes(app: FastifyInstance) {
  app.post("/api/v1/qbo/bulk-link", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccess(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    return reply.code(409).send({
      error: QBO_NATIVE_WRITE_REFUSED,
      message:
        `${QBO_NATIVE_WRITE_REFUSED}: POST /api/v1/qbo/bulk-link would write qbo_vendor_id / ` +
        `qbo_class_id onto native mdata.${parsed.data.type === "drivers" ? "drivers" : "units|equipment"} ` +
        `from QuickBooks. QuickBooks is a read-only archive (owner ruling; Lead 443.137 item 9e) — ` +
        `link native payees through the TMS A/P vendor picker; set TMS class on the unit/driver profile.`,
      applied: 0,
      failed: parsed.data.mappings.length,
      errors: [],
    });
  });
}
