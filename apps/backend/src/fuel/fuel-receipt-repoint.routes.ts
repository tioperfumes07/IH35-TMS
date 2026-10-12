/**
 * LEAD 443.121 #2 — Owner route: post the Relay fills received before the receipt poster existed (on their load, or with
 * the deadhead/yard reason) and attach every load-less fuel receipt a load now covers (same JE, same document).
 * POST /api/v1/fuel/receipts/repoint-to-loads?operating_company_id=<co>  body { dry_run?: boolean (default true) }
 * Owner only — a refusal is audited. A dry run executes inside a savepoint and rolls it back (writes nothing).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { runFuelReceiptHistory } from "./fuel-receipt-repoint.service.js";

const bodySchema = z.object({ dry_run: z.boolean().default(true) }).strict();

export async function registerFuelReceiptRepointRoutes(app: FastifyInstance) {
  app.post("/api/v1/fuel/receipts/repoint-to-loads", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = bodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const opco = query.data.operating_company_id;
    if (String(user.role ?? "") !== "Owner") {
      await withCompanyScope(user.uuid, opco, (client) =>
        appendCrudAudit(client as never, String(user.uuid), "fuel.receipt_repoint_refused_non_owner", {
          operating_company_id: opco, role: String(user.role ?? ""),
        }, "warning", "LEAD-443.121")
      );
      return reply.code(403).send({ error: "owner_only", message: "Only the Owner can post and re-point fuel receipts." });
    }
    return withCompanyScope(user.uuid, opco, (client) =>
      runFuelReceiptHistory(client as never, { operatingCompanyId: opco, actorUserId: String(user.uuid), dryRun: body.data.dry_run })
    );
  });
}
