#!/usr/bin/env node
/**
 * verify-step 12069 -- registry E-17 recommendation: "a guard that fails if a frozen-entity unit is attached to USMCA".
 * Since the operating cutover USMCA runs the fleet; IH 35 Transportation is frozen (integrations/samsara/
 * ingestion-tenants.service.ts). IH 35 Trucking LEASES equipment (owner ruling: TRK = leases only), so a
 * TRK-owned truck leased to USMCA is correct; a TRANSPORTATION-owned truck attached to USMCA is not.
 * LIVE: FAIL on any active, non-sample unit owned by a frozen entity whose operating entity
 * (COALESCE(currently_leased_to_company_id, owner_company_id)) is USMCA and that is not in the owner-pending
 * baseline. REPORT the baseline (owner-pending) and any baseline entry that has since been resolved.
 * STATIC (always): the baseline is well-formed and names the frozen entity and USMCA.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const LABEL = "verify-no-frozen-entity-unit-on-usmca";
const BASELINE = "scripts/verify-no-frozen-entity-unit-on-usmca.baseline.json";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function checkBaseline(b) {
  const p = [];
  if (!Array.isArray(b.frozen_owner_company_ids) || !b.frozen_owner_company_ids.length || !b.frozen_owner_company_ids.every((x) => UUID.test(x))) p.push("frozen_owner_company_ids missing or not uuids");
  if (!UUID.test(b.usmca_company_id ?? "")) p.push("usmca_company_id missing");
  if (b.frozen_owner_company_ids?.includes(b.usmca_company_id)) p.push("USMCA cannot be a frozen entity");
  if (!Array.isArray(b.owner_pending_unit_numbers)) p.push("owner_pending_unit_numbers must be an array");
  return p;
}
/** Pure: split attached units into new violations vs owner-pending. */
export function classify(attached, baseline) {
  const pending = new Set(baseline.owner_pending_unit_numbers);
  return {
    violations: attached.filter((u) => !pending.has(u.unit_number)),
    pending: attached.filter((u) => pending.has(u.unit_number)),
    resolved: [...pending].filter((n) => !attached.some((u) => u.unit_number === n)),
  };
}

const baseline = JSON.parse(readFileSync(resolve(ROOT, BASELINE), "utf8"));
if (process.argv.includes("--selftest")) {
  let ok = true;
  const ex = (n, cond) => { if (!cond) { console.error(`SELFTEST FAIL: ${n}`); ok = false; } };
  ex("real baseline valid", checkBaseline(baseline).length === 0);
  ex("usmca as frozen refused", checkBaseline({ ...baseline, frozen_owner_company_ids: [baseline.usmca_company_id] }).length > 0);
  const c = classify([{ unit_number: "T122" }, { unit_number: "T999" }], { owner_pending_unit_numbers: ["T122", "T124"] });
  ex("new attachment is a violation", c.violations.length === 1 && c.violations[0].unit_number === "T999");
  ex("baseline unit is pending", c.pending.length === 1);
  ex("detached baseline unit reported resolved", c.resolved.length === 1 && c.resolved[0] === "T124");
  console.log(ok ? `${LABEL} --selftest PASS (5/5)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}
const problems = checkBaseline(baseline).map((x) => `${BASELINE}: ${x}`);
if (process.env.DATABASE_URL && !problems.length) {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const attached = (await c.query(
      `SELECT u.id::text, u.unit_number FROM mdata.units u
        WHERE u.owner_company_id = ANY($1::uuid[])
          AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $2::uuid
          AND u.deactivated_at IS NULL AND COALESCE(u.is_sample_data, false) = false
        ORDER BY u.unit_number`,
      [baseline.frozen_owner_company_ids, baseline.usmca_company_id]
    )).rows;
    const r = classify(attached, baseline);
    console.log(`${LABEL}: live REPORT -- owner-pending: ${r.pending.map((u) => u.unit_number).join(", ") || "none"}${r.resolved.length ? `; resolved (remove from baseline): ${r.resolved.join(", ")}` : ""}`);
    for (const v of r.violations) problems.push(`unit ${v.unit_number} (${v.id}) is owned by a frozen entity and attached to USMCA -- not in the owner-pending baseline.`);
  } finally { await c.end(); }
} else if (!process.env.DATABASE_URL) {
  console.log(`${LABEL}: live half SKIP -- no DATABASE_URL (baseline check only).`);
}
if (problems.length) { console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL}: OK -- no new frozen-entity unit attached to USMCA.`);
