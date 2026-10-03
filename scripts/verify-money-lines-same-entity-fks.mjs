#!/usr/bin/env node
/**
 * ROUND 345 — owner: "block from having post on another company from now on". A money line may only reference a row of
 * its OWN operating company. Enforced in the database by composite (operating_company_id, <ref>) foreign keys; MATCH
 * SIMPLE skips the whole check when the child's company is NULL, so the line tables also carry a NOT NULL check.
 *
 * GENERAL RULE (live, DATABASE_URL set): on every BLOCKED table, every single-column FK whose child AND parent both
 * carry operating_company_id FAILS unless a VALIDATED composite FK covers (operating_company_id, that column) to the
 * same parent. Each line table also FAILS without its company-required CHECK. A new FK added later is caught the same
 * way. Before the block migration is in the ledger the live half reports PENDING DEPLOY.
 * STATIC (always): the block migrations still declare every phase-1 constraint. No database = FAIL (money guard).
 * Phases 2-4 extend BLOCKED as they ship. Run: node scripts/verify-money-lines-same-entity-fks.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const MIGRATIONS = ["202615320904_block_phase1_financial_same_entity_fks.sql", "202615320908_block_phase1b_line_self_and_work_order_fks.sql"];
const LAST = MIGRATIONS[MIGRATIONS.length - 1];
export const BLOCKED = [
  "accounting.invoice_lines",
  "accounting.bill_lines",
  "accounting.expense_lines",
  "accounting.payment_applications",
  "accounting.transaction_source_links",
];
// bill_lines / expense_lines carry NULL-company orphan rows (534, ruling pending) — CHECK is NOT VALID, enforced on new writes.
export const COMPANY_REQUIRED = { "accounting.bill_lines": "bill_lines_company_required", "accounting.expense_lines": "expense_lines_company_required" };
export const DECLARED = [
  "invoice_lines_account_same_entity_fkey", "invoice_lines_invoice_same_entity_fkey", "invoice_lines_item_same_entity_fkey",
  "invoice_lines_load_same_entity_fkey", "bill_lines_account_same_entity_fkey", "bill_lines_class_same_entity_fkey",
  "bill_lines_lease_asset_line_same_entity_fkey", "bill_lines_lease_contract_same_entity_fkey", "bill_lines_load_same_entity_fkey",
  "expense_lines_customer_same_entity_fkey", "expense_lines_driver_same_entity_fkey", "expense_lines_account_same_entity_fkey",
  "expense_lines_load_same_entity_fkey", "payment_applications_invoice_same_entity_fkey",
  "payment_applications_payment_same_entity_fkey", "transaction_source_links_posting_same_entity_fkey",
  "bill_lines_parent_line_same_entity_fkey", "expense_lines_parent_line_same_entity_fkey", "expense_lines_work_order_same_entity_fkey",
  ...Object.values(COMPANY_REQUIRED),
];

export function auditStatic(sql) {
  return DECLARED.filter((n) => !new RegExp(`ADD CONSTRAINT ${n}\\b`).test(sql)).map((n) => `the block migrations no longer add ${n}`);
}

/** fks: { t, col, parent, composite, validated }[] — composite = cols are (operating_company_id, col). checks: { t, name }[] */
export function auditLive(fks, checks) {
  const f = [];
  for (const k of fks.filter((x) => !x.composite)) {
    const cover = fks.find((x) => x.composite && x.t === k.t && x.col === k.col && x.parent === k.parent);
    if (!cover) f.push(`${k.t}.${k.col} -> ${k.parent}: no same-entity composite FK`);
    else if (!cover.validated) f.push(`${k.t}.${k.col} -> ${k.parent}: same-entity FK is NOT VALIDATED`);
  }
  for (const [t, name] of Object.entries(COMPANY_REQUIRED)) if (!checks.some((c) => c.t === t && c.name === name)) f.push(`${t}: ${name} missing`);
  return f;
}

const sql = MIGRATIONS.map((m) => readFileSync(`db/migrations/${m}`, "utf8")).join("\n");
if (process.argv.includes("--selftest")) {
  const fk = (o) => ({ t: "accounting.invoice_lines", col: "invoice_id", parent: "accounting.invoices", ...o });
  const checks = Object.entries(COMPANY_REQUIRED).map(([t, name]) => ({ t, name }));
  const cases = [
    ["uncovered FK", auditLive([fk({ composite: false })], checks).length === 1],
    ["unvalidated cover", auditLive([fk({ composite: false }), fk({ composite: true, validated: false })], checks).length === 1],
    ["covered + validated", auditLive([fk({ composite: false }), fk({ composite: true, validated: true })], checks).length === 0],
    ["check dropped", auditLive([], checks.slice(1)).length === 1],
    ["static removal", auditStatic(sql.replace("ADD CONSTRAINT payment_applications_payment_same_entity_fkey", "x")).length === 1],
    ["static real", auditStatic(sql).length === 0],
  ];
  const bad = cases.filter(([, ok]) => !ok);
  if (bad.length) { console.error(`selftest FAIL: ${bad.map(([n]) => n).join(", ")}`); process.exit(1); }
  console.log(`verify-money-lines-same-entity-fks selftest ${cases.length}/${cases.length}`);
  process.exit(0);
}

const fails = auditStatic(sql);
{
  // Money guard: no database is a FAIL, never a pass (require-live-db.mjs, ROUND 29.9-B).
  const { client: c, pool } = await requireLiveDbOrExit({ label: "verify-money-lines-same-entity-fks" });
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SELECT set_config('app.bypass_rls','lucia',true)"); // catalogue reads; named per the count law
    await c.query("SET LOCAL search_path = pg_catalog"); // ::regclass::text is schema-qualified only off the search_path (#24302)
    const applied = (await c.query(`SELECT 1 FROM _system._schema_migrations WHERE filename = $1`, [LAST])).rowCount > 0;
    if (!applied) {
      console.log(`verify-money-lines-same-entity-fks: PENDING DEPLOY — ${LAST} not in the ledger; static check only`);
    } else {
      const fks = (await c.query(`
        SELECT con.conrelid::regclass::text t, con.confrelid::regclass::text parent, con.convalidated validated,
               array_agg(a.attname::text ORDER BY k.ord) cols
          FROM pg_constraint con
          CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
         WHERE con.contype = 'f' AND con.conrelid::regclass::text = ANY($1)
           AND EXISTS (SELECT 1 FROM pg_attribute p WHERE p.attrelid = con.confrelid AND p.attname = 'operating_company_id' AND NOT p.attisdropped)
         GROUP BY con.oid, con.conrelid, con.confrelid, con.convalidated`, [BLOCKED])).rows
        .filter((r) => !(r.cols.length === 1 && r.cols[0] === "operating_company_id"))
        .map((r) => r.cols.length === 2 && r.cols[0] === "operating_company_id"
          ? { t: r.t, col: r.cols[1], parent: r.parent, composite: true, validated: r.validated }
          : { t: r.t, col: r.cols.join(","), parent: r.parent, composite: false });
      const checks = (await c.query(`SELECT conrelid::regclass::text t, conname name FROM pg_constraint WHERE contype = 'c' AND conname = ANY($1)`, [Object.values(COMPANY_REQUIRED)])).rows;
      fails.push(...auditLive(fks, checks));
      console.log(`verify-money-lines-same-entity-fks: ${fks.filter((k) => !k.composite).length} company-bearing FKs on ${BLOCKED.length} tables checked live`);
    }
    await c.query("ROLLBACK");
  } finally {
    c.release();
    await pool.end();
  }
}
if (fails.length) { for (const x of fails) console.error(`FAIL ${x}`); process.exit(1); }
console.log("verify-money-lines-same-entity-fks: PASS");
