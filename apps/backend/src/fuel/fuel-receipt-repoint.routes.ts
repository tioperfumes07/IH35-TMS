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
import { undoCrossRailRelayLinks } from "./relay-cross-rail-undo.service.js";

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
  // LEAD 443.133 A — undo Relay links written onto fuel rows paid on ANOTHER rail (restores the link, fuel_type and trailer the
  // link changed, from audit.row_changes; no money column moves).
  // POST /api/v1/fuel/relay-links/undo-cross-rail?operating_company_id=<co>  body { dry_run?: boolean (default true) }
  app.post("/api/v1/fuel/relay-links/undo-cross-rail", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = bodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const opco = query.data.operating_company_id;
    if (String(user.role ?? "") !== "Owner") {
      await withCompanyScope(user.uuid, opco, (client) =>
        appendCrudAudit(client as never, String(user.uuid), "fuel.relay_cross_rail_undo_refused_non_owner", {
          operating_company_id: opco, role: String(user.role ?? ""),
        }, "warning", "LEAD-443.133")
      );
      return reply.code(403).send({ error: "owner_only", message: "Only the Owner can undo a cross-rail Relay link." });
    }
    return withCompanyScope(user.uuid, opco, (client) =>
      undoCrossRailRelayLinks(client as never, { operatingCompanyId: opco, actorUserId: String(user.uuid), dryRun: body.data.dry_run })
    );
  });
}
