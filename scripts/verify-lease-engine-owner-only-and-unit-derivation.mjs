#!/usr/bin/env node
/**
 * verify-step 12073 -- ROUND 316 lease engine.
 * STATIC: create / sign / close routes refuse non-Owner actors (refuseNonOwner -> 403 + audit row); signLease
 * derives units / equipment .currently_leased_to_company_id from the live contract; closeLease clears it only when
 * no other live contract covers the asset; the legacy lease posters refuse a contract that has a lessor vendor
 * (those bill through the bill engine — never bare rent JEs).
 * LIVE (DATABASE_URL): FAIL on any active asset marked leased with no live (active, signed) lease contract that is
 * not in the owner-pending baseline; REPORT the baseline and entries now covered (remove them).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const LABEL = "verify-lease-engine-owner-only-and-unit-derivation";
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");
const P = { routes: "apps/backend/src/leases/lease.routes.ts", svc: "apps/backend/src/leases/lease-engine.service.ts", old: "apps/backend/src/accounting/lease-asc842/lease-posting.service.ts", base: "scripts/verify-lease-engine-owner-only-and-unit-derivation.baseline.json" };

export function checkStatic(s) {
  const p = [];
  for (const action of ["create", "sign", "close"]) if (!new RegExp(`refuseNonOwner\\(client as DbClient, user, "${action}"`).test(s.routes)) p.push(`${P.routes}: ${action} is not Owner-only.`);
  if (!/user\.role === "Owner"/.test(s.svc) || !/"lease\.refused_non_owner"/.test(s.svc) || !/, 403\)/.test(s.svc)) p.push(`${P.svc}: refuseNonOwner no longer 403s + audits.`);
  if (!/await deriveLeasedTo\(client, opco, leaseId, row\.lessee\)/.test(s.svc)) p.push(`${P.svc}: signing no longer derives leased-to from the contract.`);
  if (!/SET currently_leased_to_company_id = NULL[\s\S]{0,700}NOT EXISTS/.test(s.svc)) p.push(`${P.svc}: closing clears leased-to without checking other live contracts.`);
  if (!/LEASE_BILLS_THROUGH_BILL_ENGINE/.test(s.old)) p.push(`${P.old}: legacy posters no longer refuse bill-engine contracts.`);
  return p;
}
export function classify(leased, base) {
  const u = new Set(base.owner_pending_unit_numbers), e = new Set(base.owner_pending_equipment_numbers);
  const isPending = (a) => (a.kind === "unit" ? u : e).has(a.number);
  return { violations: leased.filter((a) => !a.has_contract && !isPending(a)), pending: leased.filter((a) => !a.has_contract && isPending(a)), covered: leased.filter((a) => a.has_contract && isPending(a)) };
}
const real = { routes: read(P.routes), svc: read(P.svc), old: read(P.old) };
const base = JSON.parse(read(P.base));
if (process.argv.includes("--selftest")) {
  let ok = true;
  const ex = (n, c) => { if (!c) { console.error(`SELFTEST FAIL: ${n}`); ok = false; } };
  ex("real static", checkStatic(real).length === 0);
  ex("sign not owner-only", checkStatic({ ...real, routes: real.routes.replace('refuseNonOwner(client as DbClient, user, "sign"', 'noop(client as DbClient, user, "sign"') }).length > 0);
  ex("derivation removed", checkStatic({ ...real, svc: real.svc.replace("await deriveLeasedTo(client, opco, leaseId, row.lessee)", "") }).length > 0);
  ex("legacy refusal removed", checkStatic({ ...real, old: real.old.replaceAll("LEASE_BILLS_THROUGH_BILL_ENGINE", "X") }).length > 0);
  const c = classify([{ kind: "unit", number: "T1", has_contract: false }, { kind: "unit", number: "T999", has_contract: false }, { kind: "equipment", number: "E1", has_contract: true }], { owner_pending_unit_numbers: ["T1"], owner_pending_equipment_numbers: ["E1"] });
  ex("new uncovered lease fails; pending reported; covered reported", c.violations.length === 1 && c.pending.length === 1 && c.covered.length === 1);
  console.log(ok ? `${LABEL} --selftest PASS (5/5)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}
const problems = checkStatic(real);
if (process.env.DATABASE_URL) {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const hasVendorCol = (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_schema='accounting' AND table_name='lease_contract' AND column_name='lessor_vendor_id'`)).rows.length > 0;
    // Before migration 202615190000 applies there is no signed_at / asset end_date; any active contract counts.
    const live = `EXISTS (SELECT 1 FROM accounting.lease_asset_line a JOIN accounting.lease_contract lc ON lc.id = a.lease_contract_id
                    WHERE a.%COL% = x.id AND lc.status = 'active' AND lc.voided_at IS NULL AND a.is_active
                      ${hasVendorCol ? "AND lc.signed_at IS NOT NULL AND a.end_date IS NULL" : ""})`;
    const rows = (await c.query(
      `SELECT 'unit' AS kind, x.unit_number AS number, ${live.replace("%COL%", "unit_uuid")} AS has_contract FROM mdata.units x
        WHERE x.currently_leased_to_company_id IS NOT NULL AND x.deactivated_at IS NULL AND COALESCE(x.is_sample_data, false) = false
       UNION ALL
       SELECT 'equipment', x.equipment_number, ${live.replace("%COL%", "equipment_id")} FROM mdata.equipment x
        WHERE x.currently_leased_to_company_id IS NOT NULL AND x.deactivated_at IS NULL AND COALESCE(x.is_sample_data, false) = false`
    )).rows;
    const r = classify(rows, base);
    console.log(`${LABEL}: live REPORT -- owner-pending (no contract yet): ${r.pending.length}; now covered by a signed contract (remove from baseline): ${r.covered.map((a) => a.number).join(", ") || "none"}`);
    for (const v of r.violations) problems.push(`${v.kind} ${v.number} is marked leased with no live lease contract and is not owner-pending.`);
  } finally { await c.end(); }
} else console.log(`${LABEL}: live half SKIP -- no DATABASE_URL.`);
if (problems.length) { console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL}: OK -- lease create/sign/close Owner-only; leased-to derives from the live contract; legacy posters refuse bill-engine contracts.`);
