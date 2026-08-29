import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import {
  readUntrustedSpreadsheetRows,
  SpreadsheetUploadRejectedError,
} from "../lib/untrusted-spreadsheet-read.js";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  mapFuelCardRows,
  importFuelCardTransactionsForCompany,
  type DbClient,
} from "./fuel-transaction-import.js";
import { flushFuelGlPostsAfterCommit } from "../accounting/fuel-posting/maybe-post-from-fuel-transaction.service.js";
import { flushFuelCardOverageAfterCommit } from "./fuel-card-overage.service.js";
import { canVoidCancel } from "../lib/authz/void-cancel-authz.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: DbClient) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [
      operatingCompanyId,
    ]);
    return fn(client as unknown as DbClient);
  });
}

// ACCT-F5587: POST /fuel/transactions/import (bulk fleet-card spreadsheet import) had no role gate
// at all -- currentAuthUser only requires a session. This is MORE severe than ACCT-F5586's manual
// single-row create: a bulk import can inject many fabricated expenses at once, triggers real GL
// posting (flushFuelGlPostsAfterCommit) AND, when FUEL_CARD_OVERAGE_RECOVERY_ENABLED is on, can
// create real driver receivables that flow into settlement deductions -- actual money withheld from
// a driver's pay. Reuses the canonical void/cancel executor role predicate
// (Owner/Administrator/Accountant), matching accounting/expenses.routes.ts's own accountingRoles and
// the fix already applied to the sibling fuel-transactions.routes.ts (ACCT-F5586).
function requireFuelWriteRole(reply: FastifyReply, role: string) {
  if (!canVoidCancel(role)) {
    reply.code(403).send({ error: "forbidden", detail: "importing fuel transactions requires an accounting role" });
    return false;
  }
  return true;
}

export async function registerFuelTransactionImportRoutes(app: FastifyInstance) {
  // Upload a fleet-card TRANSACTION export (Love's / WEX / EFS / Comdata) and
  // persist each purchase into fuel.fuel_transactions (FUEL-1). Idempotent.
  app.post("/api/v1/fuel/transactions/import", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!requireFuelWriteRole(reply, String(authUser.role ?? ""))) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const filePart = await req.file();
    if (!filePart) return reply.code(400).send({ error: "file_required" });
    const name = filePart.filename.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) {
      return reply.code(400).send({ error: "xlsx_or_csv_required" });
    }
    const bytes = await filePart.toBuffer();

    let rawRows: Record<string, unknown>[];
    try {
      rawRows = await readUntrustedSpreadsheetRows(bytes, filePart.filename, { cellDates: true });
    } catch (err) {
      if (err instanceof SpreadsheetUploadRejectedError) {
        return reply.code(400).send({ error: err.code });
      }
      return reply
        .code(400)
        .send({ error: "unreadable_file", detail: String((err as Error)?.message ?? err) });
    }

    const parsed = mapFuelCardRows(rawRows);

    const result = await withCompanyScope(authUser.uuid, companyId, async (client) => {
      const tableExists = await client.query<{ ok: boolean }>(
        `SELECT to_regclass('fuel.fuel_transactions') IS NOT NULL AS ok`
      );
      if (!tableExists.rows[0]?.ok) return { unavailable: true as const };

      const counts = await importFuelCardTransactionsForCompany(client, companyId, parsed, {
        userId: authUser.uuid,
        sourceFileName: filePart.filename,
      });

      await appendCrudAudit(
        client,
        authUser.uuid,
        "fuel.fuel_transactions_imported",
        {
          resource_type: "fuel.fuel_transactions",
          resource_id: companyId,
          operating_company_id: companyId,
          filename: filePart.filename,
          rows_inserted: counts.rows_inserted,
          rows_duplicate: counts.rows_duplicate,
          rows_skipped: counts.rows_skipped,
          rows_unlinked_to_load: counts.rows_unlinked_to_load,
          dead_letters: counts.dead_letters,
        },
        "info",
        "FUEL-1-TRANSACTION-IMPORT"
      );

      return { counts };
    });

    if ("unavailable" in result) {
      return reply.code(501).send({ error: "fuel_transactions_unavailable" });
    }

    // AFTER COMMIT — TMS GL only (EXPENSE_GL_POSTING_ENABLED); never QBO push.
    await flushFuelGlPostsAfterCommit(result.counts.gl_post_candidates, req.log);

    // AFTER COMMIT — BANK-DOM-06 card-overage -> driver receivable -> settlement deduction.
    // Separate flag (FUEL_CARD_OVERAGE_RECOVERY_ENABLED, default OFF) and separate failure domain:
    // the expense post and the driver recovery must not be able to break each other.
    const overage = await flushFuelCardOverageAfterCommit(result.counts.gl_post_candidates, req.log);

    const { gl_post_candidates: _gl, ...publicCounts } = result.counts;
    return {
      ...publicCounts,
      overage_events_flagged: overage.flagged,
      overage_company_variance: overage.company_variance,
      overage_posted: overage.posted,
      overage_attempted: overage.attempted,
      overage_errors: overage.errors,
      dead_letter_details: parsed.dead_letters.slice(0, 25),
    };
  });
}
