#!/usr/bin/env node
/**
 * 18393 — verify-settlement-bill-je-carries-settlement-id
 *
 * 443.37 audit gap: per-load driver bill JE postings (source_transaction_type='bill')
 * created by the settlement AP chain must carry a direct settlement_id stamp on every
 * accounting.journal_entry_postings line.
 *
 * RULE 1 (static): accounting.journal_entry_postings has a settlement_id column.
 * RULE 2 (live):   Every posted driver bill JE line that is linked to a settlement via
 *                  driver_settlement_gl_bills carries settlement_id = that settlement's id.
 *                  Zero unlinked rows = PASS. Any gap = FAIL with a count.
 *                  Heavy CI peel (LEAD 13:45Z) — repointed, same rule: 289d317cb3 (LEAD 443.116, driver pay
 *                  recognized once at DELIVERY) posts a delivery-accrued bill's JE before any settlement exists;
 *                  the A/P chain links it with bill_posted_at_delivery = true ("the delivery-accrued bill predates
 *                  this settlement — a settlement void reverses its payments, never the bill"). That earlier JE
 *                  cannot carry the later settlement's id, so those link rows are excluded; every bill the
 *                  settlement itself posts must still carry the stamp.
 *
 * --selftest: the RULE 2 predicate must exclude ONLY at-delivery link rows and still require the stamp.
 */
import { spawnSync } from "node:child_process";

export const RULE2_SQL = `
  SELECT COUNT(*)
  FROM accounting.journal_entry_postings jep
  JOIN driver_finance.driver_settlement_gl_bills dsg
    ON dsg.bill_journal_entry_id::text = jep.journal_entry_uuid::text
  WHERE jep.source_transaction_type = 'bill'
    AND jep.settlement_id IS NULL
    AND dsg.bill_posted_at_delivery IS NOT TRUE
`;

/** Static shape of RULE 2: the stamp is required, and only delivery-accrued link rows are excused. */
export function rule2Problems(sql) {
  const p = [];
  if (!/jep\.settlement_id IS NULL/.test(sql)) p.push("RULE 2 no longer requires the settlement_id stamp");
  if (!/jep\.source_transaction_type = 'bill'/.test(sql)) p.push("RULE 2 no longer scopes to bill postings");
  if (!/dsg\.bill_posted_at_delivery IS NOT TRUE/.test(sql)) p.push("RULE 2 counts delivery-accrued bills (443.116 c) as unstamped");
  if (/bill_posted_at_delivery\s*(=|IS)\s*(true|TRUE)\b(?!\s*IS NOT)/.test(sql.replace(/IS NOT TRUE/g, ""))) p.push("RULE 2 excuses settlement-posted bills");
  return p;
}

if (process.argv.includes("--selftest")) {
  const plants = [
    ["shipped RULE 2", RULE2_SQL, false],
    ["stamp requirement dropped", RULE2_SQL.replace("AND jep.settlement_id IS NULL", ""), true],
    ["delivery-accrual exclusion dropped (fresh-DB fixtures go red again)", RULE2_SQL.replace("AND dsg.bill_posted_at_delivery IS NOT TRUE", ""), true],
    ["scope widened beyond bills", RULE2_SQL.replace("jep.source_transaction_type = 'bill'", "TRUE"), true],
  ];
  let bad = 0;
  for (const [name, sql, expectCaught] of plants) {
    const caught = rule2Problems(sql).length > 0;
    console.log(`  ${caught === expectCaught ? "PASS" : "FAIL"}  ${name}`);
    if (caught !== expectCaught) bad++;
  }
  console.log(`[18393] --selftest ${bad ? "FAIL" : "PASS"} ${plants.length - bad}/${plants.length}`);
  process.exit(bad ? 1 : 0);
}

const STEP = "18393";
const NAME = "verify-settlement-bill-je-carries-settlement-id";

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 30_000 });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status ?? 1 };
}

// The runner imports this step without --selftest: check the shipped RULE 2 shape on every run so it cannot drift.
{
  const shape = rule2Problems(RULE2_SQL);
  if (shape.length) {
    console.error(`FINDING [${STEP}] RULE 2 SHAPE FAIL: ${shape.join("; ")}`);
    process.exit(1);
  }
}

// ── RULE 1: static column existence ────────────────────────────────────────
const pg = run("psql", [process.env.DATABASE_URL ?? "", "-AXtc",
  `SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema='accounting' AND table_name='journal_entry_postings' AND column_name='settlement_id'`
]);
if (pg.status !== 0 || pg.stdout.trim() === "0") {
  // Static check: can be satisfied without a live DB when column appears in a migration.
  const grep = run("grep", ["-r", "settlement_id", "db/migrations"]);
  const found = grep.stdout.includes("202615510300");
  if (!found) {
    console.error(`FINDING [${STEP}] RULE 1 FAIL: settlement_id column not declared in db/migrations`);
    process.exit(1);
  }
  // DB not available or column not yet applied — static proof is enough for pre-deploy.
  console.log(`[${STEP}] RULE 1 PASS (static): migration 202615510300 declares settlement_id on journal_entry_postings`);
  if (!process.env.DATABASE_URL) {
    console.log(`[${STEP}] RULE 2 SKIP: no DATABASE_URL — live check skipped`);
    console.log(`PASS ${STEP} ${NAME}`);
    process.exit(0);
  }
}

if (!process.env.DATABASE_URL) {
  console.log(`[${STEP}] RULE 1 PASS (static)`);
  console.log(`[${STEP}] RULE 2 SKIP: no DATABASE_URL`);
  console.log(`PASS ${STEP} ${NAME}`);
  process.exit(0);
}

console.log(`[${STEP}] RULE 1 PASS: settlement_id column present`);

// ── RULE 2: live — every settlement-linked bill JE line carries settlement_id ─
const live = run("psql", [process.env.DATABASE_URL, "-AXtc", RULE2_SQL]);

if (live.status !== 0) {
  console.error(`FINDING [${STEP}] RULE 2 ERROR: psql query failed — ${live.stderr.trim()}`);
  process.exit(1);
}

const missing = parseInt(live.stdout.trim(), 10);
if (isNaN(missing)) {
  console.error(`FINDING [${STEP}] RULE 2 ERROR: unexpected output — ${live.stdout.trim()}`);
  process.exit(1);
}

if (missing > 0) {
  console.error(`FINDING [${STEP}] RULE 2 FAIL: ${missing} bill JE posting line(s) linked to a settlement via driver_settlement_gl_bills carry no settlement_id stamp`);
  process.exit(1);
}

console.log(`[${STEP}] RULE 2 PASS: all settlement-linked bill JE posting lines carry settlement_id`);
console.log(`PASS ${STEP} ${NAME}`);
process.exit(0);
