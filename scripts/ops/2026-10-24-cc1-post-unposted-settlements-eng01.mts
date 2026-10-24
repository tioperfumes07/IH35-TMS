/**
 * ENG-01 (443.322) — Post the 3 USMCA load-bookended settlements that were closed
 * without GL via settlement-payrun-close.routes.ts (close-trip route, missing
 * postLoadBookendedSettlementGlAfterClose call, now fixed in PR #27507).
 *
 * postLoadBookendedSettlementGlAfterClose wraps closeSettlementPayRun — every posting
 * goes through the full close engine (ledger validation, idempotency claim, audit log).
 *
 * Settlements to post (verified prod bypass_rls=lucia 2026-10-24, ROUND 443.322):
 *   P-0113  — net_pay $1,416.47, model=load_bookended, 4 lines
 *   P-0117  — net_pay   $329.51, model=load_bookended, 2 lines
 *   P-0119  — net_pay   $457.80, model=load_bookended, 3 lines
 *
 * AUTH: owner 10-24 1:25 PM CT "get all those fixed now"; OWNER_AUTH_ID=AUTH-463
 *
 * Usage (dry-run, no writes):
 *   DATABASE_URL=<prod> node --loader ts-node/esm scripts/ops/2026-10-24-cc1-post-unposted-settlements-eng01.mts
 *
 * Usage (apply — posts GL for each unposted settlement):
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-463 node --loader ts-node/esm scripts/ops/2026-10-24-cc1-post-unposted-settlements-eng01.mts --apply
 */
import pg from "pg";
import { postLoadBookendedSettlementGlAfterClose } from "../../apps/backend/src/driver-finance/settlement-payrun-close.service.js";

const USMCA_CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const COMMIT = process.argv.includes("--apply");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (COMMIT && !process.env.OWNER_AUTH_ID?.match(/^AUTH-[0-9]+$/)) {
  throw new Error("--apply requires OWNER_AUTH_ID=AUTH-NNN (e.g. AUTH-463)");
}
console.log(`ENG-01 ops · mode=${COMMIT ? "APPLY" : "DRY-RUN"} · ${new Date().toISOString()}`);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

async function queryTB(client: pg.Client, settlementId: string) {
  const res = await client.query(
    `SELECT
       a.account_number, a.name AS account_name,
       SUM(CASE WHEN jep.entry_type = 'debit'  THEN jep.amount_cents ELSE 0 END) AS debit_cents,
       SUM(CASE WHEN jep.entry_type = 'credit' THEN jep.amount_cents ELSE 0 END) AS credit_cents,
       COUNT(*) AS lines
     FROM accounting.journal_entry_postings jep
     JOIN catalogs.accounts a
       ON a.id = jep.account_id AND a.operating_company_id = jep.operating_company_id
     WHERE jep.operating_company_id = $1::uuid
       AND jep.source_transaction_id = $2
       AND jep.source_transaction_type IN ('driver_settlement','settlement_payrun')
       AND jep.voided_at IS NULL
     GROUP BY a.account_number, a.name
     ORDER BY a.account_number`,
    [USMCA_CO, settlementId]
  );
  return res.rows;
}

try {
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await c.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA_CO]);

  const res = await c.query(
    `SELECT id::text, display_id, status, posted_at, settlement_model,
            net_pay_cents, trip_closed_at::text
       FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid
        AND display_id = ANY(ARRAY['P-0113','P-0117','P-0119'])
        AND voided_at IS NULL
      ORDER BY display_id`,
    [USMCA_CO]
  );

  if (res.rows.length === 0) throw new Error("No target settlements found — wrong company or all voided");

  console.log("\n── TARGET SETTLEMENTS ──────────────────────────────────────");
  for (const row of res.rows) {
    console.log(
      `  ${row.display_id}  id=${row.id}  status=${row.status}  posted_at=${row.posted_at ?? "NULL"}  net_pay=$${(row.net_pay_cents / 100).toFixed(2)}`
    );
  }

  const alreadyPosted = res.rows.filter((r) => r.posted_at != null);
  if (alreadyPosted.length > 0) {
    console.log(`\nREFUSED: ${alreadyPosted.length} settlement(s) already have posted_at set — safe to skip:`);
    for (const r of alreadyPosted) console.log(`  ✓ ${r.display_id} already posted at ${r.posted_at}`);
  }

  const toPost = res.rows.filter((r) => r.posted_at == null);
  if (toPost.length === 0) {
    console.log("\nAll target settlements are already posted. Nothing to do.");
    process.exit(0);
  }

  console.log(`\n── TB BEFORE (${toPost.length} unposted settlements, 0 JE lines expected) ──`);
  for (const s of toPost) {
    const tb = await queryTB(c, s.id);
    console.log(`  ${s.display_id}: ${tb.length === 0 ? "0 JE lines (expected)" : JSON.stringify(tb)}`);
  }

  if (!COMMIT) {
    console.log("\n── DRY RUN — pass --apply + OWNER_AUTH_ID=AUTH-463 to post. No GL written. ──");
    process.exit(0);
  }

  console.log("\n── APPLY: posting GL for each settlement via closeSettlementPayRun ──");
  const jeIds: string[] = [];
  for (const s of toPost) {
    process.stdout.write(`  ${s.display_id} (${s.id}) … `);
    const result = await postLoadBookendedSettlementGlAfterClose({
      operatingCompanyId: USMCA_CO,
      settlementId: s.id,
      actorUserId: OWNER_USER_ID,
    });
    if (result.posted) {
      console.log(`✓ JE ${result.journal_entry_id}`);
      if (result.journal_entry_id) jeIds.push(result.journal_entry_id);
    } else {
      console.error(`✗ FAILED: ${result.error}`);
      process.exitCode = 1;
    }
  }

  console.log("\n── TB AFTER ─────────────────────────────────────────────────");
  // Re-query with a fresh bypass since pooled connections may reset GUC
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await c.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA_CO]);
  for (const s of toPost) {
    const tb = await queryTB(c, s.id);
    if (tb.length === 0) {
      console.error(`  ✗ ${s.display_id}: 0 JE lines AFTER apply — posting likely failed`);
      process.exitCode = 1;
    } else {
      let debitTotal = 0, creditTotal = 0;
      for (const row of tb) {
        debitTotal += Number(row.debit_cents);
        creditTotal += Number(row.credit_cents);
        console.log(
          `  ${s.display_id}  ${row.account_number} ${row.account_name.padEnd(40)} Dr ${String(row.debit_cents).padStart(8)} Cr ${String(row.credit_cents).padStart(8)}`
        );
      }
      const balanced = debitTotal === creditTotal;
      console.log(
        `  ${s.display_id}  ── TOTAL Dr=${debitTotal} Cr=${creditTotal} ${balanced ? "BALANCED ✓" : "UNBALANCED ✗"}`
      );
      if (!balanced) process.exitCode = 1;
    }
  }

  console.log(`\n── JE IDs POSTED: ${jeIds.join(", ") || "(none — check failures above)"} ──`);
  console.log("\nNext: re-run scripts/verify-settlement-close-must-post-gl.mjs to confirm guard green.");
  console.log("Then: lower verify-no-document-without-a-ledger ratchet driver_settlements 1→0 in a follow-up commit.");
} finally {
  await c.end();
}
