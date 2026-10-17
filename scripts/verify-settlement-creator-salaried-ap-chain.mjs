#!/usr/bin/env node
/**
 * GUARD — LEAD RULING 443.45 Ask C (CC-3): a salaried week (no per-load driver bills) is billed by the A/P chain on one
 * A/P bill per load with NO driver bill, marked pay_basis 'salaried'.
 *   RULE 1 (static) — the chain falls back to loadSalariedSettlementLoads ONLY when a settlement has no driver bills;
 *          that loader requires the 0-rate "Salaried" override (rate 0, reason >= 10 chars starting "Salaried"); the
 *          driver-bill settle UPDATE is skipped when there is no driver bill; the run row writes pay_basis; migration
 *          202615530900 adds pay_basis with CHECK (driver_bill_id IS NOT NULL OR pay_basis = 'salaried').
 *   RULE 2 (live) — every driver_settlement_gl_bills row with no driver bill is pay_basis 'salaried', and its load
 *          carries the Salaried override. (Reported as "migration pending" until pay_basis exists on the database.)
 * Run: node scripts/verify-settlement-creator-salaried-ap-chain.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "a salaried A/P bill is live money — fails closed without a database";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-salaried-ap-chain";
const CHAIN = "apps/backend/src/driver-finance/settlement-ap-chain.service.ts";
const MIG = "db/migrations/202615530900_driver_settlement_gl_bills_pay_basis_salaried.sql";

export function staticProblems(chain, mig) {
  const p = [];
  if (!/if \(!bills\.length\) bills = await loadSalariedSettlementLoads\(client, opco, input\.settlementId\);/.test(chain)) p.push("RULE 1 the chain does not fall back to the settlement's salaried loads (only) when it has no driver bills");
  const f = chain.indexOf("export async function loadSalariedSettlementLoads(");
  const body = f < 0 ? "" : chain.slice(f, chain.indexOf("\n}\n", f));
  if (!/l\.driver_pay_rate_per_mile = 0/.test(body) || !body.includes("driver_pay_rate_override_reason ~* '^\\\\s*(salaried|local driver — weekly salary)'") || !/>= 10/.test(body)) p.push("RULE 1 the salaried loader does not require the 0-rate Salaried override");
  if (!/driverBillId: null, [^}]*payBasis: "salaried"/.test(body)) p.push("RULE 1 a salaried load is not billed with no driver bill and payBasis 'salaried'");
  // Heavy CI peel — re-pointed, same rule: 289d317cb3 (LEAD 443.116 (c), driver pay recognized at delivery) added the
  // close_supplement role, so the settle UPDATE is now also skipped for a close-time supplement
  // (`if (x.b.driverBillId && x.role !== "close_supplement")`) and the run-row column list continues after pay_basis
  // (bill_posted_at_delivery, supplements_driver_bill_id). The salaried skip and the pay_basis record are still required.
  if (!/if \(x\.b\.driverBillId(?: && x\.role !== "close_supplement")?\) \{[\s\S]{0,260}?await client\.query\(\s*`UPDATE driver_finance\.driver_bills SET settled_in_settlement_id/.test(chain)) p.push("RULE 1 the driver-bill settle UPDATE is not skipped for a salaried load");
  if (!/deduction_cents, cash_cents, pay_basis[,)]/.test(chain) || !/x\.b\.payBasis \?\? "per_load_driver_bill"/.test(chain)) p.push("RULE 1 the run row does not record pay_basis");
  if (!/ADD COLUMN IF NOT EXISTS pay_basis text NOT NULL DEFAULT 'per_load_driver_bill'/.test(mig) || !/CHECK \(driver_bill_id IS NOT NULL OR pay_basis = 'salaried'\)/.test(mig)) p.push("RULE 1 migration 202615530900 does not add pay_basis + the driver-bill-or-salaried CHECK");
  return p;
}

export function liveProblems(rows) {
  return rows.map((r) => `RULE 2 run bill ${r.id} (load ${r.load_number}) has no driver bill but pay_basis='${r.pay_basis}' / salaried load=${r.salaried}`);
}

function selftest() {
  const chain = fs.readFileSync(path.join(ROOT, CHAIN), "utf8");
  const mig = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  const bad = [];
  if (staticProblems(chain, mig).length) bad.push(`real tree flagged: ${staticProblems(chain, mig).join("; ")}`);
  const plants = [
    [(c) => c.replace("if (!bills.length) bills = await loadSalariedSettlementLoads(client, opco, input.settlementId);", ""), (m) => m],
    [(c) => c.replace("AND l.driver_pay_rate_per_mile = 0", "AND true"), (m) => m],
    [(c) => c.replace('if (x.b.driverBillId && x.role !== "close_supplement") {', "if (true) {"), (m) => m],
    [(c) => c.replace("deduction_cents, cash_cents, pay_basis,", "deduction_cents, cash_cents,"), (m) => m],
    [(c) => c.replace('x.b.payBasis ?? "per_load_driver_bill"', '"per_load_driver_bill"'), (m) => m],
    [(c) => c, (m) => m.replace("CHECK (driver_bill_id IS NOT NULL OR pay_basis = 'salaried')", "CHECK (true)")],
  ];
  for (const [fc, fm] of plants) {
    const c2 = fc(chain), m2 = fm(mig);
    if (c2 === chain && m2 === mig) bad.push(`plant did not apply: ${fc.toString().slice(0, 60)}`);
    else if (!staticProblems(c2, m2).length) bad.push(`plant passed: ${fc.toString().slice(0, 60)}`);
  }
  if (!liveProblems([{ id: "x", load_number: "1", pay_basis: "per_load_driver_bill", salaried: false }]).length) bad.push("a NULL-driver-bill row that is not salaried passes");
  if (bad.length) { console.error(`${LABEL} selftest FAIL\n- ${bad.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (${plants.length} plants + 1 live fixture)`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const p = staticProblems(fs.readFileSync(path.join(ROOT, CHAIN), "utf8"), fs.readFileSync(path.join(ROOT, MIG), "utf8"));
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let note = "";
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const col = (await client.query(`SELECT 1 FROM information_schema.columns WHERE table_schema='driver_finance' AND table_name='driver_settlement_gl_bills' AND column_name='pay_basis'`)).rows.length > 0;
    if (!col) note = " (migration 202615530900 not applied on this database yet — RULE 2 pending)";
    else {
      const rows = (await client.query(
        `SELECT gb.id::text, gb.load_number, gb.pay_basis,
                (l.driver_pay_rate_per_mile = 0 AND l.driver_pay_rate_override_reason ~* '^(salaried|local driver — weekly salary)') AS salaried
           FROM driver_finance.driver_settlement_gl_bills gb LEFT JOIN mdata.loads l ON l.id = gb.load_id
          WHERE gb.driver_bill_id IS NULL AND gb.superseded_at IS NULL
            AND NOT (gb.pay_basis = 'salaried' AND COALESCE(l.driver_pay_rate_per_mile = 0 AND l.driver_pay_rate_override_reason ~* '^(salaried|local driver — weekly salary)', false))`)).rows;
      p.push(...liveProblems(rows));
    }
    await client.query("ROLLBACK");
  } finally {
    client.release?.(); await pool?.end?.();
  }
  if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} PASS${note}`);
}
