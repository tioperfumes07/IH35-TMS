#!/usr/bin/env node
/**
 * verify-unit-lease-owner-asset-holder — ENG-54 UNIT OWNERSHIP ENGINE (ROUND 8.20).
 * Owner rule: every real truck is owned by IH 35 Trucking LLC (asset holder) and leased to USMCA.
 * Root cause it guards: a 2026-09-01 batch write re-owned T122 / T124 / T156 to IH 35 Transportation (an operating
 * carrier) while they stayed leased to USMCA, and none of the ~20 mdata.units writers refused it.
 *   1. the row rule exists: trigger function refuses a lease to an operating_carrier when the owner is not an
 *      asset_holder, on INSERT and on an UPDATE that changes owner or lessee;
 *   2. it restores the caller's app.bypass_rls after reading org.companies (no bypass leaks into the caller);
 *   3. the unit create / profile PATCH / bulk update routes turn the refusal into a 422 the screen can show.
 * Usage: node scripts/verify-unit-lease-owner-asset-holder.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-unit-lease-owner-asset-holder";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202616570100_unit_lease_owner_asset_holder_engine.sql";
const RULE = "apps/backend/src/mdata/unit-ownership-rule.ts";
const UNITS = "apps/backend/src/mdata/units.routes.ts";
const BULK = "apps/backend/src/mdata/unit-bulk-update.routes.ts";

export function check(files) {
  const f = [];
  const mig = files[MIG] ?? "";
  const rule = files[RULE] ?? "";
  const units = files[UNITS] ?? "";
  const bulk = files[BULK] ?? "";
  if (!mig) return ["ENG-54 migration missing"];
  if (!/IF v_lessee_type = 'operating_carrier' AND v_owner_type IS DISTINCT FROM 'asset_holder' THEN\s+RAISE EXCEPTION 'unit_owner_must_be_asset_holder'/.test(mig)) f.push("row rule does not refuse an operating-carrier lease owned by a non-asset-holder");
  if (!/BEFORE INSERT ON mdata\.units\s+FOR EACH ROW\s+EXECUTE FUNCTION mdata\.tg_units_lease_owner_asset_holder\(\)/.test(mig)) f.push("rule not enforced on INSERT");
  if (!/BEFORE UPDATE ON mdata\.units\s+FOR EACH ROW\s+WHEN \(OLD\.owner_company_id IS DISTINCT FROM NEW\.owner_company_id\s+OR OLD\.currently_leased_to_company_id IS DISTINCT FROM NEW\.currently_leased_to_company_id\)/.test(mig)) f.push("rule not enforced on an UPDATE that changes owner or lessee");
  if (!/PERFORM set_config\('app\.bypass_rls', COALESCE\(v_prev_bypass, ''\), true\);/.test(mig)) f.push("trigger does not restore the caller's app.bypass_rls");
  if (!/e\.code === "P0001" && e\.message === UNIT_OWNER_MUST_BE_ASSET_HOLDER/.test(rule)) f.push("refusal detector does not match the trigger's P0001 unit_owner_must_be_asset_holder");
  if (!/reply\.code\(422\)/.test(rule)) f.push("refusal is not a 422");
  const mapped = (src) => (src.match(/if \(isUnitOwnershipViolation\((?:err|error)\)\) return sendUnitOwnershipViolation\(reply, (?:err|error)\);/g) ?? []).length;
  if (mapped(units) < 2) f.push("units.routes.ts create + PATCH do not both map the refusal to 422");
  if (mapped(bulk) < 1) f.push("unit-bulk-update.routes.ts does not map the refusal to 422");
  return f;
}

function readAll() {
  const out = {};
  for (const rel of [MIG, RULE, UNITS, BULK]) {
    const abs = path.join(ROOT, rel);
    out[rel] = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  }
  return out;
}

function selftest() {
  const live = readAll();
  const mut = (key, from, to) => ({ ...live, [key]: live[key].replace(from, to) });
  const cases = [
    ["rule accepts any owner", mut(MIG, "v_owner_type IS DISTINCT FROM 'asset_holder'", "false")],
    ["no INSERT trigger", mut(MIG, "BEFORE INSERT ON mdata.units", "AFTER INSERT ON mdata.other")],
    ["UPDATE trigger ignores owner change", mut(MIG, "WHEN (OLD.owner_company_id IS DISTINCT FROM NEW.owner_company_id", "WHEN (false")],
    ["bypass leaks into the caller", mut(MIG, "PERFORM set_config('app.bypass_rls', COALESCE(v_prev_bypass, ''), true);", "")],
    ["detector matches nothing", mut(RULE, 'e.code === "P0001" && e.message === UNIT_OWNER_MUST_BE_ASSET_HOLDER', "false")],
    ["PATCH not mapped", mut(UNITS, "if (isUnitOwnershipViolation(err)) return sendUnitOwnershipViolation(reply, err);", "")],
    ["bulk not mapped", mut(BULK, "if (isUnitOwnershipViolation(error)) return sendUnitOwnershipViolation(reply, error);", "")],
    ["migration deleted", { ...live, [MIG]: "" }],
  ];
  let pass = 0;
  const liveF = check(live);
  if (liveF.length === 0) pass += 1; else console.error(`${LABEL} --selftest: live tree fails`, liveF);
  for (const [name, files] of cases) {
    if (check(files).length > 0) pass += 1; else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) { console.error(`${LABEL} --selftest FAIL ${pass}/${total}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const f = check(readAll());
  if (f.length) { for (const x of f) console.error(`${LABEL}: FAIL — ${x}`); process.exit(1); }
  console.log(`${LABEL}: PASS — a unit leased to an operating carrier must be owned by an asset holder, enforced on INSERT and owner/lessee UPDATE, bypass restored, refusal is a 422 on create / PATCH / bulk`);
}
