#!/usr/bin/env node
/**
 * verify-step 12077 -- ROUND 316 monthly lease bill engine.
 * FAILS IF: the engine stops creating bills through the canonical createBill; the gate (vendor, unit/trailer, period,
 * account, class) is skipped; bills lose the idempotency key / lease_contract_id / lease_period_start; lines lose
 * class / unit / trailer / lease links; the bill poster stops honouring a line's class; the billing-mode choice is
 * ignored; the cron or routes are unwired.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const LABEL = "verify-lease-bill-engine";
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");
const P = { eng: "apps/backend/src/leases/lease-bill-engine.service.ts", post: "apps/backend/src/accounting/posting-engine.service.ts", bills: "apps/backend/src/accounting/bills.service.ts", idx: "apps/backend/src/index.ts" };

export function check(s) {
  const p = [];
  if (!/const bill = await createBill\(/.test(s.eng)) p.push(`${P.eng}: lease bills no longer go through the canonical createBill.`);
  if (/INSERT INTO accounting\.bills\b/.test(s.eng) || /INSERT INTO accounting\.journal_entr/.test(s.eng)) p.push(`${P.eng}: the engine writes bills / JEs directly.`);
  if (!/const gate = gateLeaseBill\(plan\);\s*if \(!gate\.ok\)/.test(s.eng)) p.push(`${P.eng}: the gate is not applied before posting.`);
  for (const f of ["leasePeriodStart: plan.period_start", "leaseContractId: plan.lease_contract_id", "leaseBillKey: plan.key", "classId: l.class_id", "unitId: l.unit_id", "equipmentId: l.equipment_id", "leaseAssetLineId: l.lease_asset_line_id"]) if (!s.eng.includes(f)) p.push(`${P.eng}: bill / line link "${f}" missing.`);
  if (!/billing_mode === "one_bill_per_unit"/.test(s.eng)) p.push(`${P.eng}: billing mode ignored.`);
  if (!/class_id: row\.class_id \?\? bill\.class_id/.test(s.post)) p.push(`${P.post}: the bill poster no longer honours a line's class.`);
  if (!/lease_asset_line_id,\s*\n\s*operating_company_id/.test(s.bills)) p.push(`${P.bills}: createBill no longer persists line lease links.`);
  if (!/registerLeaseRoutes\(app\)/.test(s.idx) || !/initializeLeaseBillCron\(app\)/.test(s.idx)) p.push(`${P.idx}: lease routes or bill cron not wired.`);
  return p;
}
const real = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, read(v)]));
if (process.argv.includes("--selftest")) {
  let ok = true;
  const ex = (n, s, f) => { const pr = check(s); if ((pr.length > 0) !== f) { console.error(`SELFTEST FAIL: ${n}: ${JSON.stringify(pr)}`); ok = false; } };
  ex("real", real, false);
  ex("gate skipped", { ...real, eng: real.eng.replace("const gate = gateLeaseBill(plan);", "const gate = { ok: true } as const;") }, true);
  ex("direct insert", { ...real, eng: real.eng + "\nconst x = `INSERT INTO accounting.bills (id) VALUES (1)`;" }, true);
  ex("poster ignores line class", { ...real, post: real.post.replace("class_id: row.class_id ?? bill.class_id", "class_id: bill.class_id") }, true);
  ex("cron unwired", { ...real, idx: real.idx.replace("initializeLeaseBillCron(app)", "x(app)") }, true);
  console.log(ok ? `${LABEL} --selftest PASS (5/5)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}
const problems = check(real);
if (problems.length) { console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL}: OK -- lease bills through the canonical bill engine, gated, idempotent, class = unit per line, billing mode honoured, cron + routes wired.`);
