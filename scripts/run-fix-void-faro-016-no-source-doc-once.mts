/**
 * GO-AMENDMENT CARVE-OUT 1 (docs/lockdown/... / 00-PASTE-NOW-GO-AMENDMENT.txt, pasted 2026-08-30):
 * Faro invoice 016 (MPH Carrier Services, $3,800.00, PO MPHC261334, purchased 08/18, wired
 * $3,676.00) has NO QuickBooks invoice behind it -- the QBO doc series jumps 015 -> 017. AlwaysTrack
 * load 13524 (MPH, 08/18, W.O. "pending") exists at a DIFFERENT gross rate, $4,200.00. $4,200
 * hauled, $3,800 factored, $0 invoiced -- the receivable pledged to Faro has nothing on the books
 * behind it, which fails ASC 860 secured-borrowing's requirement that the pledged receivable exist
 * on-book (already locked in this repo, enforced by verify-factoring-treatment.mjs).
 *
 * run-task6-faro-33-invoices-once.mts created this invoice (INV-2026-00062, id
 * 0b75c502-11d3-43c5-9dd0-aa55d7fc2340, row 016) BEFORE this amendment landed. WORM: void it, do
 * not delete. It is still status='draft' with no journal entry ever posted against it (created via
 * a raw one-time backfill script, never sent/submitted), so the void is a pure status flip -- no GL
 * reversal is needed and postVoidReversal (the real void-service helper) confirms this by returning
 * a no-op (reversed_line_count: 0) when it finds no original GL postings for the entity.
 *
 * OWNER DECISION REQUIRED (per the amendment): is the MPH 08/18 load $4,200 or $3,800? No seat
 * posts 016 again until Jorge rules. This script only removes the wrongly-created row; it does not
 * create a replacement.
 *
 * Usage:
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-fix-void-faro-016-no-source-doc-once.mts          # dry run
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-fix-void-faro-016-no-source-doc-once.mts --commit  # apply
 */
import pg from "pg";
import { isVoidEnforcementEnabled, postVoidReversal, auditVoid, pgDateColumnToIsoDay } from "../apps/backend/src/accounting/void.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const INVOICE_ID = "0b75c502-11d3-43c5-9dd0-aa55d7fc2340"; // INV-2026-00062, row 016, MPH $3,800
const VOID_REASON =
  "GO-AMENDMENT CARVE-OUT 1 (00-PASTE-NOW-GO-AMENDMENT.txt): no QuickBooks invoice exists for " +
  "Faro 016 (doc series jumps 015->017); AlwaysTrack load 13524 is $4,200 gross, not $3,800. " +
  "Receivable pledged to Faro with nothing on the books behind it violates ASC 860. Voided pending " +
  "owner ruling on the true load amount ($4,200 vs $3,800); not recreated by this script.";

const COMMIT = process.argv.includes("--commit");
const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

    const cur = await client.query(
      `SELECT id, display_id, status, total_cents, issue_date::text AS issue_date_iso, voided_at
         FROM accounting.invoices WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
      [INVOICE_ID, USMCA]
    );
    const row = cur.rows[0];
    if (!row) throw new Error(`invoice ${INVOICE_ID} not found under USMCA`);
    console.log(`FOUND: ${row.display_id} status=${row.status} total_cents=${row.total_cents} voided_at=${row.voided_at}`);
    if (row.status === "void" || row.voided_at) {
      console.log("Already void -- nothing to do.");
      await client.query("ROLLBACK");
      return;
    }
    if (row.status === "paid") throw new Error("invoice is paid -- cannot void, escalate instead");

    const flagOn = await isVoidEnforcementEnabled(client, USMCA, ACTOR_USER_UUID);
    console.log(`VOID-EVERYWHERE flag: ${flagOn}`);

    const reversal = flagOn
      ? await postVoidReversal(
          client,
          {
            operatingCompanyId: USMCA,
            entityType: "invoice",
            entityId: INVOICE_ID,
            originalDate: pgDateColumnToIsoDay(row.issue_date_iso),
            memo: `Void reversal of invoice ${INVOICE_ID}: ${VOID_REASON}`,
          },
          { userId: ACTOR_USER_UUID }
        )
      : { reversal_journal_entry_id: null, reversal_date: null, closed_period_reversal: false, reversed_line_count: 0 };
    console.log(`postVoidReversal result: ${JSON.stringify(reversal)}`);
    if (reversal.reversed_line_count !== 0) {
      throw new Error(
        `UNEXPECTED: this draft invoice had ${reversal.reversed_line_count} GL line(s) to reverse -- ` +
          `expected 0 (never sent/posted). Stopping before mutating further; investigate before rerunning.`
      );
    }

    await client.query(
      `UPDATE accounting.invoices
          SET status = 'void', voided_at = now(), void_reason = $2, updated_at = now(), updated_by_user_id = $3
        WHERE id = $1`,
      [INVOICE_ID, VOID_REASON, ACTOR_USER_UUID]
    );

    if (flagOn) {
      await auditVoid(client, ACTOR_USER_UUID, "invoice", {
        operatingCompanyId: USMCA,
        entityId: INVOICE_ID,
        reason: VOID_REASON,
        reversal,
      });
    }

    if (!COMMIT) {
      console.log("DRY RUN -- rolling back. Pass --commit to apply.");
      await client.query("ROLLBACK");
      return;
    }
    await client.query("COMMIT");
    console.log(`VOIDED: ${row.display_id} (${INVOICE_ID})`);

    // Fresh, correctly bypass-scoped verification read after commit. set_config(..., true) is
    // transaction-local (the recurring GUC-scoping bug this whole session): a bare call outside an
    // explicit BEGIN auto-commits in its OWN one-statement transaction and is already gone by the
    // very next statement. Wrap both in one explicit BEGIN/COMMIT so the bypass is still live when
    // the SELECT actually runs.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const verify = await client.query(
      `SELECT status, voided_at FROM accounting.invoices WHERE id = $1`,
      [INVOICE_ID]
    );
    await client.query("COMMIT");
    console.log(`VERIFY: status=${verify.rows[0]?.status} voided_at=${verify.rows[0]?.voided_at}`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
