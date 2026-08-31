import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { runDriverSubAccountBackfill } from "./driver-subaccount-backfill.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

// LAW-EDITABLE-BY-PERMISSION-ALWAYS-TRACEABLE-2026-09-01: "a hard 'cannot be mutated' with no
// authorized path is a DEFECT, not a safety feature." STOP-DECISION #2 correctly reserved the write
// run for the owner's own explicit go rather than letting any coder or automated pass silently
// bulk-mint chart-of-accounts rows against real drivers — but it shipped as a route that did not
// exist at all, which is the exact "hard cannot-be-mutated, no authorized path" shape the new law
// forbids. This is the fix: the SAME write, now reachable, but shaped exactly like the law requires
// — blocked for most roles, permitted for Owner/Accountant (Administrator kept too, matching every
// other write-role gate in this file's sibling routes), gated behind an explicit typed confirmation,
// and every application writes its own top-level audit event (actor, timestamp, counts, reason) in
// addition to the per-account audit events the shared provisioners already emit. Reuses the EXACT
// idempotent service the dry-run route already calls — no new GL/account-creation logic.
const dryRunQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const applyBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  confirm: z.literal(true),
  reason: z.string().trim().min(1).max(2000),
});
const REVIEW_ROLES = new Set(["Owner", "Administrator", "Accountant", "SuperAdmin"]);
// LAW: "The OWNER is always authorized. The ACCOUNTANT is authorized." Administrator kept — every
// other write action in this driver-finance surface (hire, deactivate) already trusts Administrator
// with real driver/account mutations, and narrowing it here alone would be an inconsistent gate, not
// a safer one.
const APPLY_ROLES = new Set(["Owner", "Administrator", "Accountant"]);

export async function registerDriverSubAccountBackfillRoutes(app: FastifyInstance) {
  app.get("/api/v1/payroll/driver-subaccount-backfill/dry-run", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!REVIEW_ROLES.has(String((user as { role?: string }).role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const query = dryRunQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    // apply is hard-coded false here: this endpoint NEVER writes.
    const report = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      runDriverSubAccountBackfill(client, { operatingCompanyId: query.data.operating_company_id, apply: false })
    );
    return reply.send(report);
  });

  app.post(
    "/api/v1/payroll/driver-subaccount-backfill/apply",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const role = String((user as { role?: string }).role ?? "");
      if (!APPLY_ROLES.has(role)) {
        return reply.code(403).send({ error: "forbidden", detail: "backfill apply requires Owner, Administrator, or Accountant" });
      }
      const body = applyBodySchema.safeParse(req.body ?? {});
      if (!body.success) return validationError(reply, body.error);

      const report = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
        const result = await runDriverSubAccountBackfill(client, {
          operatingCompanyId: body.data.operating_company_id,
          apply: true,
          actorUserId: user.uuid,
        });
        // LAW: every authorized edit writes an audit record — actor, timestamp, before/after, why.
        // The per-account creates are already audited by the shared provisioners (catalogs.accounts.
        // created); this is the TOP-LEVEL record of the backfill RUN itself, so "who ran the backfill,
        // when, how many accounts it actually touched, and why" is answerable without reconstructing
        // it from dozens of per-account rows.
        await appendCrudAudit(
          client,
          user.uuid,
          "driver_finance.subaccount_backfill.applied",
          {
            resource_type: "driver_finance.driver_advance_accounts+accounting.escrow_accounts",
            operating_company_id: body.data.operating_company_id,
            actor_role: role,
            reason: body.data.reason,
            drivers_scanned: result.totals.drivers_scanned,
            asset_created: result.totals.asset_to_create,
            escrow_created: result.totals.escrow_to_create,
            ap_vendor_created: result.totals.ap_vendor_to_create,
            already_existing: result.totals.already_existing,
            no_parent: result.totals.no_parent,
          },
          "info",
          "LAW-EDITABLE-BY-PERMISSION-ALWAYS-TRACEABLE"
        );
        return result;
      });
      return reply.send(report);
    }
  );
}
