import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { runBankOrphanBackfill } from "./bank-orphan-backfill.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { canVoid } from "../accounting/void.service.js";

// BANK-ORPHAN-01 BACKFILL (LAW-EDITABLE-BY-PERMISSION-ALWAYS-TRACEABLE-2026-09-01 shape: blocked for
// most roles, permitted for Owner/Accountant, always logged). void.service.ts's postVoidReversal now
// un-matches a bank transaction unconditionally on every FUTURE void, but the 4 documents cited in the
// owner's original BANK-ORPHAN-01 report voided BEFORE that fix shipped -- there is no future void
// event left for them to ride. This is the one-time authorized reach-back, shaped exactly like
// driver-subaccount-backfill.routes.ts: dry-run is read-only for a wider role set, apply is
// Owner/Accountant only (canVoid -- the SAME gate every other void action in this codebase uses),
// requires a typed confirmation + reason, and writes its own top-level audit event in addition to
// whatever unmatchBankTransactionById itself does.
const dryRunQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const applyBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  confirm: z.literal(true),
  reason: z.string().trim().min(1).max(2000),
});
const REVIEW_ROLES = new Set(["Owner", "Administrator", "Accountant", "SuperAdmin"]);

export async function registerBankOrphanBackfillRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/banking/bank-orphan-backfill/dry-run",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!REVIEW_ROLES.has(String(user.role ?? ""))) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const query = dryRunQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);

      // apply is hard-coded false here: this endpoint NEVER writes.
      const report = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
        runBankOrphanBackfill(client, { operatingCompanyId: query.data.operating_company_id, apply: false })
      );
      return reply.send(report);
    }
  );

  app.post(
    "/api/v1/banking/bank-orphan-backfill/apply",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const role = String(user.role ?? "");
      if (!canVoid(role)) {
        return reply.code(403).send({ error: "forbidden", detail: "bank-orphan backfill apply requires Owner or Accountant" });
      }
      const body = applyBodySchema.safeParse(req.body ?? {});
      if (!body.success) return validationError(reply, body.error);

      const report = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
        const result = await runBankOrphanBackfill(client, {
          operatingCompanyId: body.data.operating_company_id,
          apply: true,
        });
        await appendCrudAudit(
          client,
          user.uuid,
          "banking.bank_orphan_backfill.applied",
          {
            resource_type: "banking.bank_transactions",
            operating_company_id: body.data.operating_company_id,
            actor_role: role,
            reason: body.data.reason,
            orphan_count: result.orphan_count,
            unmatched_count: result.unmatched_count,
            bank_transaction_ids: result.rows.map((r) => r.bank_transaction_id),
          },
          "warning",
          "BANK-ORPHAN-01"
        );
        return result;
      });

      return reply.send(report);
    }
  );
}
