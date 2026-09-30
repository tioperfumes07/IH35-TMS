#!/usr/bin/env -S npx tsx
/**
 * AUTH-161 -- ROUND 291.3: void 4 Transportation-Faro invoices. Do NOT post the other 8.
 *
 * Lead's order (docs/bus/09-30-2026-CC-2-ROUND-291-THIRTEEN-UNPOSTED-INVOICES-52960.md) named
 * "POST THESE EIGHT": INV-2026-00003 (13509), 13616, 13618, 13620, 13621, 13622, 13625, 13626.
 * Re-verified live immediately before writing this script (NOT assumed from the order): ALL 8 are
 * blocked by ACCT-F59 (posting-engine.service.ts:946-973, `revrecLatchOwnsLoad` +
 * `loadReachedDeliveryEvidence`) -- a deliberate, incident-motivated guard (a real prior
 * $1,875.50 duplicate-revenue defect) that PERMANENTLY excludes any load-sourced invoice from the
 * invoice-GL poster once its load has reached delivery evidence, whether or not a
 * load_revenue_recognition_postings row exists YET. Confirmed by direct dry-run call to
 * `postInvoiceGlIfEnabled` against 13625 (the one candidate that looked cleanest on paper --
 * real invoice_lines matching the total, zero existing latch rows): it still throws
 * INVOICE_REVREC_LATCH_OWNS_LOAD, code-level, not a stale cache or a guessed refusal.
 *   - INV-2026-00003 (load 13509): load_revenue_recognition_postings already carries a live
 *     'earn'+'bill' pair totaling $8,800.00 (the correct two-event latch recognizing this load's
 *     $4,400.00 revenue) -- posting the invoice too would be a THIRD recognition of the same cash.
 *   - 13616/13618/13620/13621/13622: ALSO zero rows in accounting.invoice_lines (a second,
 *     independent blocker even before ACCT-F59 -- the poster has nothing to price).
 *   - 13625/13626: real invoice_lines, zero existing latch rows, but their loads have reached
 *     delivery evidence -- ACCT-F59's order-independent arm refuses them anyway.
 * The real remedy for all 8 is making the DISP-01 two-event latch fire for these loads (repair
 * or manually trigger it), never posting the invoice document directly -- that is a distinct,
 * larger investigation (why didn't 8 delivered loads' latch fire?), not attempted in this script.
 * Reported in full on the board and back to Lead; NOT forced here under deadline pressure.
 *
 * VOID (4, $18,110.00): INV-2026-00001 (13503), INV-2026-00002 (13504), INV-2026-00004 (13533),
 * INV-2026-00005 (13539) -- all TRANSPORTATION-Faro under the 2026-09-05 owner ruling, named among
 * the nine such loads (13496/13500/13503/13504/13506/13517/13531/13533/13539) that the earlier
 * 27-family wrong-entity void missed. Voided via the sanctioned governance void engine
 * (executeVoidCancel -> executeInvoice), never a hand JE. All 4 have zero live postings
 * (verified), so the engine's own postVoidReversal step is a documented no-op (readOriginalGlPostings
 * empty -> returns immediately, no JE) -- this is a pure header void.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc2-auth161-round291-void4-invoices.ts [--apply]
 * (run from repo root)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-161";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const VOID_REASON =
  "ROUND 291.3 / 2026-09-05 owner ruling: TRANSPORTATION-Faro invoice surviving the earlier 27-family wrong-entity void. Void never delete.";

const VOID_IDS: { display_id: string; id: string; expected_cents: number }[] = [
  { display_id: "INV-2026-00001", id: "e1ed335c-4d83-42e7-8da0-4b60c6674150", expected_cents: 490000 },
  { display_id: "INV-2026-00002", id: "e7e70b12-93a7-4ae4-9e09-cf9ee17235e1", expected_cents: 490000 },
  { display_id: "INV-2026-00004", id: "0764fee9-df4a-41d7-8eff-7bf0f3b7412b", expected_cents: 345000 },
  { display_id: "INV-2026-00005", id: "53d1270b-7121-45f9-962f-5863605e5a2d", expected_cents: 486000 },
];

const BLOCKED_NOT_POSTED: { display_id: string; reason: string }[] = [
  { display_id: "INV-2026-00003 (13509)", reason: "load_revenue_recognition_postings already latches this load's $4,400.00 (earn+bill, $8,800.00 total live) -- posting would double-count revenue" },
  { display_id: "13616", reason: "zero accounting.invoice_lines rows -- cannot price a post; load also reached delivery evidence" },
  { display_id: "13618", reason: "zero accounting.invoice_lines rows -- cannot price a post; load also reached delivery evidence" },
  { display_id: "13620", reason: "zero accounting.invoice_lines rows -- cannot price a post; load also reached delivery evidence" },
  { display_id: "13621", reason: "zero accounting.invoice_lines rows -- cannot price a post; load also reached delivery evidence" },
  { display_id: "13622", reason: "zero accounting.invoice_lines rows -- cannot price a post; load also reached delivery evidence" },
  { display_id: "13625", reason: "real invoice_lines, zero existing latch rows, but load reached delivery evidence -- ACCT-F59 refuses (INVOICE_REVREC_LATCH_OWNS_LOAD), confirmed by a live dry-run call to postInvoiceGlIfEnabled" },
  { display_id: "13626", reason: "same shape as 13625 -- load reached delivery evidence, ACCT-F59 applies" },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  if (APPLY) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`${AUTH_ID} rejected by verify-owner-authorization.mjs -- refusing --apply.`);
      process.exit(1);
    }
  }

  const { executeVoidCancel } = await import(path.join(ROOT, "apps/backend/src/governance/void-cancel-executors.ts"));

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    console.log("NOT POSTED (all 8 named by the order, blocked live -- see file header + board finding):");
    for (const r of BLOCKED_NOT_POSTED) console.log(`  ${r.display_id}: ${r.reason}`);

    console.log("\n--- VOID (4) ---");
    for (const inv of VOID_IDS) {
      const check = await client.query<{ status: string; voided_at: string | null; total_cents: string }>(
        `SELECT status, voided_at::text, total_cents::text FROM accounting.invoices WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
        [inv.id, USMCA]
      );
      const row = check.rows[0];
      if (!row) throw new Error(`${inv.display_id}: not found`);
      if (row.status === "void" || row.voided_at) throw new Error(`${inv.display_id}: already voided -- refusing`);
      if (Number(row.total_cents) !== inv.expected_cents) throw new Error(`${inv.display_id}: total_cents mismatch, expected ${inv.expected_cents}, got ${row.total_cents}`);

      const result = await (executeVoidCancel as any)("invoice", {
        client,
        operatingCompanyId: USMCA,
        entityId: inv.id,
        action: "void",
        userId: ACTOR_USER_ID,
        reason: VOID_REASON,
      });
      console.log(`  ${inv.display_id}:`, JSON.stringify(result));
      if (result.kind !== "ok") throw new Error(`${inv.display_id}: void refused (${result.kind}) -- refusing to continue`);
    }

    const closure21 = await client.query<{ open_invoices_cents: string; ar_cents: string }>(
      `
      SELECT
        (SELECT COALESCE(SUM(total_cents),0)::text FROM accounting.invoices
          WHERE operating_company_id=$1 AND status IN ('sent','partial') AND voided_at IS NULL AND is_sample_data=false) AS open_invoices_cents,
        (SELECT COALESCE(SUM(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END),0)::text
           FROM catalogs.accounts a
           JOIN accounting.journal_entry_postings jep ON jep.account_id=a.id
           JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid AND je.voided_at IS NULL AND je.status='posted'
          WHERE a.operating_company_id=$1 AND a.account_number='1100') AS ar_cents
      `,
      [USMCA]
    );
    console.log("\nClosure 21 (this transaction, before commit):", closure21.rows[0], "gap:", Number(closure21.rows[0].open_invoices_cents) - Number(closure21.rows[0].ar_cents));
    console.log("(Expected: gap shrinks from $52,960.00 to $34,850.00 -- the 8 blocked invoices'");
    console.log(" total -- NOT to $0. Closing the remaining gap requires firing the DISP-01 latch");
    console.log(" for these 8 loads, a separate, larger fix reported on the board.)");

    if (APPLY) {
      await client.query("COMMIT");
      console.log("COMMITTED");
    } else {
      await client.query("ROLLBACK");
      console.log("DRY RUN — rolled back, nothing written");
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
