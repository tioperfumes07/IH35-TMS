#!/usr/bin/env node
/**
 * FACTOR-BUT-NOT-DELIVERED (Lead, 2026-09-30). Owner, verbatim: "unless we have approval from the
 * customer, we already have this engine, factor but not delivered."
 *
 * The engine is dispatch.manual_delivery_authorizations, shipped 2026-09-07 from the owner's own
 * words: "sometimes we might send a delivery confirmation to the factoring, even though we have not
 * officially delivered... i need to be able to manually do this."
 *
 * THE DEFECT THIS LOCKS: an invoice may be ISSUED and FACTORED on a load that has not delivered —
 * but ONLY with the customer's approval recorded through that engine. Measured live 2026-09-30:
 * dispatch.manual_delivery_authorizations held 0 rows across ALL companies (the engine was built and
 * never once used), while loads 13625 and 13626 carried SENT invoices with Faro advances of
 * $6,062.50 and $3,298.00 against them. Two invoices issued before delivery with no recorded
 * approval, and no guard anywhere that would notice.
 *
 * This is the money guard for that: every issued (non-draft/proforma/void) invoice on a load still in
 * a pre-delivery status must have an ACTIVE, non-revoked manual delivery authorization. Baseline is
 * shrink-only — the count may go down, never up.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const REQUIRES_LIVE_DB =
  "live money guard -- queries invoices/loads/manual_delivery_authorizations against Postgres; " +
  "fails closed with no DATABASE_URL per ROUND 29.9-B, so it must never run in verify-static's " +
  "dead-port sweep.";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-issued-invoice-on-rolling-load-needs-authorization";
const BASELINE = path.join(ROOT, "scripts", `${LABEL}.baseline.json`);
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const PRE_DELIVERY = ["dispatched", "at_pickup", "in_transit", "at_delivery"];

export function analyse(rows, baselineCount) {
  const problems = [];
  if (rows.length > baselineCount) {
    problems.push(
      `${rows.length} issued invoice(s) sit on loads that have NOT delivered and carry NO active ` +
        `manual delivery authorization (baseline ${baselineCount}, shrink-only). An invoice may be ` +
        `factored before delivery ONLY with the customer's approval recorded through ` +
        `dispatch.manual_delivery_authorizations.`
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["a new violation is caught", analyse([{}, {}, {}], 2).length === 1],
    ["at baseline passes", analyse([{}, {}], 2).length === 0],
    ["below baseline passes (shrink-only)", analyse([], 2).length === 0],
    ["zero baseline, one violation is caught", analyse([{}], 0).length === 1],
  ];
  let bad = 0;
  for (const [name, ok] of cases) { console.log(`  ${ok ? "ok" : "FAIL"} — ${name}`); if (!ok) bad++; }
  if (bad) { console.error(`${LABEL}: SELFTEST FAIL`); process.exit(1); }
  console.log(`${LABEL}: PASS — selftest ${cases.length}/${cases.length}`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")).count : 0;
if (!process.env.DATABASE_URL) {
  console.error(`${LABEL}: FAIL — DATABASE_URL not set. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B).`);
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE neondb_owner");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const { rows } = await client.query(
    `SELECT l.load_number, i.display_id, i.status AS invoice_status, i.factoring_status
       FROM accounting.invoices i
       JOIN mdata.loads l ON l.id = i.source_load_id
      WHERE i.operating_company_id = $1::uuid
        AND i.voided_at IS NULL
        AND i.status NOT IN ('draft','proforma','void')
        AND l.status::text = ANY($2::text[])
        AND NOT EXISTS (
          SELECT 1 FROM dispatch.manual_delivery_authorizations m
           WHERE m.load_id = l.id AND m.revoked_at IS NULL
        )
      ORDER BY l.load_number`,
    [USMCA, PRE_DELIVERY]
  );
  await client.query("ROLLBACK");
  const problems = analyse(rows, baseline);
  if (rows.length > 0) {
    console.error(`${LABEL}: ${rows.length} invoice(s) issued on a load that has not delivered, with no authorization:`);
    for (const r of rows) {
      console.error(`  - load ${r.load_number} · invoice ${r.display_id} · ${r.invoice_status} · factoring ${r.factoring_status}`);
    }
  }
  if (problems.length > 0) { console.error(`\n  ${LABEL} FAIL:\n    - ${problems.join("\n    - ")}\n`); process.exit(1); }
  console.log(`${LABEL}: PASS — ${rows.length} at/below baseline ${baseline}; none newly unauthorized.`);
} finally {
  await client.end();
}
