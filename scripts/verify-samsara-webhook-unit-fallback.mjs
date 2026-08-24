#!/usr/bin/env node
/**
 * verify-samsara-webhook-unit-fallback.mjs  (0243-d4-1)
 *
 * Root cause: the Samsara vehicle-driver-pairing WEBHOOK path (telematics/vehicle-driver-lookup.service.ts
 * resolveLocalIds) resolved the local unit ONLY via mdata.equipment.samsara_vehicle_id, with no
 * mdata.units.samsara_vehicle_id PRIMARY lookup — so webhook-delivered driver logins dropped until the
 * 5-min reconcile poll papered over them. The fix mirrors the proven units-primary -> equipment-fallback
 * pattern already used by pairing.service.ts resolveLocalUnitAndDriver. This guard keeps that PRIMARY
 * lookup present in resolveLocalIds so the regression can't reappear.
 *
 * Usage:
 *   node scripts/verify-samsara-webhook-unit-fallback.mjs            # scan
 *   node scripts/verify-samsara-webhook-unit-fallback.mjs --selftest # regression harness -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILE = "apps/backend/src/telematics/vehicle-driver-lookup.service.ts";

function assertHasUnitsPrimary(src) {
  const offenders = [];
  // resolveLocalIds must query mdata.units by samsara_vehicle_id (PRIMARY), scoped by COALESCE(lessee,owner).
  const scope = src.slice(src.indexOf("async function resolveLocalIds"), src.indexOf("async function getOpenAssignment"));
  const hasUnitsPrimary =
    /FROM\s+mdata\.units/.test(scope) &&
    /samsara_vehicle_id\s*=\s*\$2/.test(scope) &&
    /COALESCE\(\s*currently_leased_to_company_id\s*,\s*owner_company_id\s*\)/.test(scope);
  if (!hasUnitsPrimary)
    offenders.push(`${FILE}: resolveLocalIds must resolve the unit PRIMARY via mdata.units.samsara_vehicle_id (COALESCE(lessee,owner) scoped) before the equipment fallback`);
  const hasSharedDriverScope =
    /d\.samsara_driver_id\s*=\s*\$2/.test(scope) &&
    /d\.operating_company_id\s*=\s*\$1::uuid/.test(scope) &&
    /FROM\s+mdata\.driver_company_authorizations\s+webhook_pairing_driver_dca/.test(scope) &&
    /webhook_pairing_driver_dca\.driver_id\s*=\s*d\.id/.test(scope) &&
    /webhook_pairing_driver_dca\.company_id\s*=\s*\$1::uuid/.test(scope) &&
    /webhook_pairing_driver_dca\.is_authorized\s*=\s*true/.test(scope) &&
    /webhook_pairing_driver_dca\.deactivated_at\s+IS\s+NULL/.test(scope);
  if (!hasSharedDriverScope)
    offenders.push(`${FILE}: resolveLocalIds must admit an active shared-driver authorization in the webhook event company`);
  return offenders;
}

export function run() {
  const offenders = assertHasUnitsPrimary(fs.readFileSync(path.join(repoRoot, FILE), "utf8"));
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const sharedDriver = "SELECT d.id FROM mdata.drivers d WHERE d.samsara_driver_id = $2 AND (d.operating_company_id = $1::uuid OR EXISTS (SELECT 1 FROM mdata.driver_company_authorizations webhook_pairing_driver_dca WHERE webhook_pairing_driver_dca.driver_id = d.id AND webhook_pairing_driver_dca.company_id = $1::uuid AND webhook_pairing_driver_dca.is_authorized = true AND webhook_pairing_driver_dca.deactivated_at IS NULL))";
  const good =
    `async function resolveLocalIds(){ SELECT id FROM mdata.units WHERE COALESCE(currently_leased_to_company_id, owner_company_id) = $1 AND samsara_vehicle_id = $2; ${sharedDriver} } async function getOpenAssignment(){}`;
  const badUnit =
    `async function resolveLocalIds(){ SELECT e.current_unit_id FROM mdata.equipment e WHERE e.samsara_vehicle_id = $2; ${sharedDriver} } async function getOpenAssignment(){}`;
  const badDriver = good.replace(
    "webhook_pairing_driver_dca.is_authorized = true",
    "webhook_pairing_driver_dca.is_authorized = false"
  );
  const goodPasses = assertHasUnitsPrimary(good).length === 0;
  const badUnitFails = assertHasUnitsPrimary(badUnit).some((problem) => problem.includes("unit PRIMARY"));
  const badDriverFails = assertHasUnitsPrimary(badDriver).some((problem) => problem.includes("shared-driver authorization"));
  if (goodPasses && badUnitFails && badDriverFails) {
    console.log("verify:samsara-webhook-unit-fallback selftest OK — unit primary + shared-driver authorization defects rejected");
    process.exit(0);
  }
  console.error("verify:samsara-webhook-unit-fallback selftest FAILED");
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error("verify:samsara-webhook-unit-fallback FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log("verify:samsara-webhook-unit-fallback OK — webhook unit resolution has the units-primary lookup");
}
