#!/usr/bin/env node
// ROUND 326 item 3 (CC-1) — a money line never outlives its document. The 2026-09-30 purge deleted USMCA expenses and
// invoices but left the journal entries that posted for them (1,974 orphan JEs + their reversal partners = 2,035;
// A/P control overstated $2,976.63, 9000 Ask My Accountant inflated by the same). The complete-delete engine now takes a
// document's JEs with it (DOC_SOURCE); this guard holds the count, shrink-only, until the orphan-postings scope runs.
// Live, read-only, FAIL-CLOSED without DATABASE_URL. USMCA (the TMS is its ERP).
import { readFileSync } from "node:fs";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

// --selftest (Devin build order 2026-10-05): live-DB guards cannot be fixture-tested — their inputs
// are rows on Neon. One case MUST pass (live check green, or the canonical no-credential refusal
// when nothing resolves locally) and one MUST fail (dead credential — it must refuse, never green).
if (process.argv.includes("--selftest")) { await selftest_verify_no_orphan_source_postings(); }
async function selftest_verify_no_orphan_source_postings() {
  const { runGuard, reportSelftest, statusOf, outputOf, DEAD_DB_ENV } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const noDb = runGuard(me, { env: DEAD_DB_ENV });
  const refused = /DATABASE_URL (?:is )?(?:not set|unset|required)|credential/.test(outputOf(real));
  reportSelftest("verify_no_orphan_source_postings", [
    { name: "live check green, or canonically refuses with no credential", pass: statusOf(real) === 0 || refused, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-300) },
    { name: "refuses on dead credential", pass: statusOf(noDb) !== 0, detail: statusOf(noDb) !== 0 ? undefined : outputOf(noDb).slice(-200) },
  ]);
}

const LABEL = "verify-no-orphan-source-postings";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const base = JSON.parse(readFileSync(new URL("./verify-no-orphan-source-postings.baseline.json", import.meta.url), "utf8"));
const DOCS = [
  ["expense", "accounting.expenses"], ["invoice", "accounting.invoices"], ["bill", "accounting.bills"], ["bill_payment", "accounting.bill_payments"],
  ["driver_settlement", "driver_finance.driver_settlements"], ["load", "mdata.loads"], ["factoring_advance", "accounting.factoring_advances"],
];

const engine = readFileSync(new URL("./ops/2026-10-02-cc1-r326-complete-delete.ts", import.meta.url), "utf8");
if (!/DOC_SOURCE/.test(engine) || !/JE posting for a deleted \$\{table\}/.test(engine)) {
  console.error(`${LABEL}: STATIC FAIL — the complete-delete engine must take a deleted document's JEs with it (DOC_SOURCE)`);
  process.exit(1);
}

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const per = {};
  let total = 0;
  for (const [type, table] of DOCS) {
    const n = Number((await client.query(
      `SELECT count(DISTINCT p.journal_entry_uuid)::int n FROM accounting.journal_entry_postings p
        LEFT JOIN ${table} d ON d.id::text = p.source_transaction_id::text
        WHERE p.operating_company_id = $1::uuid AND p.source_transaction_type = $2 AND d.id IS NULL`, [USMCA, type])).rows[0].n);
    per[type] = n;
    total += n;
  }
  await client.query("ROLLBACK");
  if (total > base.orphan_jes) {
    console.error(`${LABEL}: LIVE FAIL — ${total} JEs post for a document that no longer exists (baseline ${base.orphan_jes}, measured_at ${base.measured_at}): ${JSON.stringify(per)}`);
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — ${total} orphan JE(s) (baseline ${base.orphan_jes}, measured_at ${base.measured_at}), 0 new ${JSON.stringify(per)}${total < base.orphan_jes ? " — SHRINK the baseline" : ""}`);
} finally {
  client.release();
  await pool.end();
}
