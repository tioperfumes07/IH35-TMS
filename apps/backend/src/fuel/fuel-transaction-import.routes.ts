import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import {
  readUntrustedSpreadsheetRows,
  SpreadsheetUploadRejectedError,
} from "../lib/untrusted-spreadsheet-read.js";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { importDreamlineStatement, importWexStatement, parseDreamlineStatementRows } from "./dreamline-statement-import.service.js";
import { runFuelFollowsTruck } from "./fill-truck-and-load.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  mapFuelCardRows,
  importFuelCardTransactionsForCompany,
  type DbClient,
} from "./fuel-transaction-import.js";
import { flushFuelGlPostsAfterCommit } from "../accounting/fuel-posting/maybe-post-from-fuel-transaction.service.js";
import { flushFuelCardOverageAfterCommit } from "./fuel-card-overage.service.js";
import { onFuelIngestComplete } from "./fuel-ingest-hooks.js";
import { canVoidCancel } from "../lib/authz/void-cancel-authz.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
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

/** A provider-statement export: Card #, Disc PPU and Disc Amt columns on the header row (443.202). */
export function isProviderStatementShape(rawRows: Record<string, unknown>[]): boolean {
  const first = rawRows[0];
  if (!first) return false;
  const keys = new Set(Object.keys(first).map((k) => k.trim().toLowerCase().replace(/[^a-z0-9#]+/g, "")));
  return keys.has("card#") && keys.has("discppu") && keys.has("discamt");
}

export async function registerFuelTransactionImportRoutes(app: FastifyInstance) {
  // Upload a fleet-card TRANSACTION export (Love's / WEX / EFS / Comdata) and
  // persist each purchase into fuel.fuel_transactions (FUEL-1). Idempotent.
  app.post("/api/v1/fuel/transactions/import", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
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

    // LEAD 443.202 — a fuel-card PROVIDER STATEMENT (Card # + Disc PPU + Disc Amt: the Dreamline / England WEX export) is
    // never a generic fleet import: here it would land with no card rail (USMCA reads a row with no card as Relay and the
    // fill never posts) and a second copy of every receipt a settlement already carries. Refused with where it goes.
    if (isProviderStatementShape(rawRows)) {
      return reply.code(400).send({
        error: "provider_statement_use_statement_import",
        detail: "This is a fuel-card provider statement (Card #, Disc PPU, Disc Amt). Import it as that card's statement (England WEX statement / Dreamline statement), not as a fleet-card export.",
      });
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

    // ROUND 306 E-21/E-22 — AFTER COMMIT: match the new rows to trucks and run fraud detection once,
    // for this company only. Not awaited by the response; failures are logged, never swallowed silently.
    if (result.counts.rows_inserted > 0) {
      void onFuelIngestComplete(req.log, "fuel_statement_upload", [companyId]).catch((err: unknown) =>
        req.log.error({ err, operating_company_id: companyId }, "[FUEL_INGEST_HOOK] post-upload matching failed")
      );
    }

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

  // LEAD 443.142 — the Dreamline (EFS) provider statement: the export's "Discounted" sheet is the source of truth for every
  // Dreamline receipt. Adopts receipts already on the books (never posts twice), posts the card discount / amount difference
  // to the file's number, imports the missing fills through the one poster. dry_run=true writes nothing and returns the plan.
  app.post("/api/v1/fuel/dreamline/statement-import", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!requireFuelWriteRole(reply, String(authUser.role ?? ""))) return;
    const query = companyQuerySchema.extend({ dry_run: z.enum(["true", "false"]).optional(), stamp_only: z.enum(["true", "false"]).optional() }).safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;
    const dryRun = query.data.dry_run !== "false";
    await assertCompanyMembership(authUser.uuid, companyId);

    const filePart = await req.file();
    if (!filePart) return reply.code(400).send({ error: "file_required" });
    if (!filePart.filename.toLowerCase().endsWith(".xlsx")) return reply.code(400).send({ error: "xlsx_required" });
    let rawRows: Record<string, unknown>[];
    try {
      rawRows = await readUntrustedSpreadsheetRows(await filePart.toBuffer(), filePart.filename, { cellDates: true });
    } catch (err) {
      if (err instanceof SpreadsheetUploadRejectedError) return reply.code(400).send({ error: err.code });
      return reply.code(400).send({ error: "unreadable_file", detail: String((err as Error)?.message ?? err) });
    }
    const parsed = parseDreamlineStatementRows(rawRows);
    if (parsed.lines.length === 0) return reply.code(400).send({ error: "no_dreamline_lines", dead_letters: parsed.dead_letters.slice(0, 25) });

    const summary = await withLuciaBypass(async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
      return importDreamlineStatement(client as never, {
        operating_company_id: companyId,
        actor_user_uuid: authUser.uuid,
        lines: parsed.lines,
        dry_run: dryRun,
        stamp_only: query.data.stamp_only === "true",
      });
    });
    return { dry_run: dryRun, stamp_only: query.data.stamp_only === "true", file: filePart.filename, dead_letters: parsed.dead_letters.slice(0, 25), ...summary };
  });

  // LEAD 443.202 — the England Logistics WEX card statement (owner's TransactionReport .csv, or .xlsx): one fuel row per
  // ticket + product on card WEX at what WEX charged, posted on receipt Dr fuel / Cr 2520 through the one poster; a
  // receipt a settlement already carries is ADOPTED (listed with its settlement), never a second row. dry_run=true
  // (the default) writes nothing and returns the plan.
  // LEAD 443.214 — fuel follows the truck at the pump: every fill's truck by Samsara GPS at the station and the load that
  // truck was running at the provider's real pump moment. dry_run (default) lists every fill; apply moves the confident
  // re-points + the owner's rulings through the one engine (fuel rows + expense document + GL load, audited, TB unchanged).
  const fuelFollowsTruckBody = z.object({
    operating_company_id: z.string().uuid(),
    dry_run: z.boolean().default(true),
    fuel_ids: z.array(z.string().uuid()).max(5000).optional(),
    rulings: z.array(z.object({
      fuel_id: z.string().uuid(),
      to_unit_id: z.string().uuid().nullable().optional(),
      to_load_id: z.string().uuid().nullable().optional(),
      reason: z.string().trim().min(10).max(500),
    })).max(200).optional(),
  });
  app.post("/api/v1/fuel/fill-truck-and-load/rerun", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!requireFuelWriteRole(reply, String(authUser.role ?? ""))) return;
    const body = fuelFollowsTruckBody.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;
    if (!b.dry_run && !["Owner", "Admin"].includes(String(authUser.role ?? ""))) return reply.code(403).send({ error: "owner_or_admin_applies_fuel_repoints" });
    await assertCompanyMembership(authUser.uuid, b.operating_company_id);
    const result = await withLuciaBypass(async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [b.operating_company_id]);
      return runFuelFollowsTruck(client as never, {
        companyId: b.operating_company_id, actorUserId: authUser.uuid, dryRun: b.dry_run, fuelIds: b.fuel_ids ?? null, rulings: b.rulings ?? [],
      });
    });
    return { dry_run: b.dry_run, ...result };
  });

  app.post("/api/v1/fuel/wex/statement-import", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!requireFuelWriteRole(reply, String(authUser.role ?? ""))) return;
    const query = companyQuerySchema.extend({ dry_run: z.enum(["true", "false"]).optional(), stamp_only: z.enum(["true", "false"]).optional() }).safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;
    const dryRun = query.data.dry_run !== "false";
    await assertCompanyMembership(authUser.uuid, companyId);

    const filePart = await req.file();
    if (!filePart) return reply.code(400).send({ error: "file_required" });
    const name = filePart.filename.toLowerCase();
    if (!name.endsWith(".csv") && !name.endsWith(".xlsx")) return reply.code(400).send({ error: "xlsx_or_csv_required" });
    let rawRows: Record<string, unknown>[];
    try {
      rawRows = await readUntrustedSpreadsheetRows(await filePart.toBuffer(), filePart.filename, { cellDates: true, csvText: true });
    } catch (err) {
      if (err instanceof SpreadsheetUploadRejectedError) return reply.code(400).send({ error: err.code });
      return reply.code(400).send({ error: "unreadable_file", detail: String((err as Error)?.message ?? err) });
    }
    if (!isProviderStatementShape(rawRows)) return reply.code(400).send({ error: "not_a_wex_statement", detail: "Card #, Disc PPU and Disc Amt columns are required (the WEX TransactionReport export)." });
    const parsed = parseDreamlineStatementRows(rawRows);
    if (parsed.lines.length === 0) return reply.code(400).send({ error: "no_wex_lines", dead_letters: parsed.dead_letters.slice(0, 25) });

    const summary = await withLuciaBypass(async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
      return importWexStatement(client as never, {
        operating_company_id: companyId,
        actor_user_uuid: authUser.uuid,
        lines: parsed.lines,
        dry_run: dryRun,
        stamp_only: query.data.stamp_only === "true",
      });
    });
    return { dry_run: dryRun, stamp_only: query.data.stamp_only === "true", file: filePart.filename, dead_letters: parsed.dead_letters.slice(0, 25), ...summary };
  });
}
