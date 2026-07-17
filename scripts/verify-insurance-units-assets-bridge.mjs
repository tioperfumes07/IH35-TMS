#!/usr/bin/env node
/**
 * 0441-mod6 — Insurance policy/claim wizards pass mdata.units.id but
 * insurance.policy_unit / insurance.claim FK to mdata.assets.id.
 * Guard: shared resolveMdataAssetId bridge used on all write paths.
 *
 *   node scripts/verify-insurance-units-assets-bridge.mjs
 *   node scripts/verify-insurance-units-assets-bridge.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-insurance-units-assets-bridge";

const SHARED = "apps/backend/src/insurance/resolve-asset-id.shared.ts";
const POLICY = "apps/backend/src/insurance/policy.routes.ts";
const CLAIM = "apps/backend/src/insurance/claim.routes.ts";
const ATOMIC = "apps/backend/src/insurance/policy-create-atomic.service.ts";
const POLICY_DETAIL = "apps/frontend/src/pages/insurance/PolicyDetail.tsx";
const INSURANCE_API = "apps/frontend/src/api/insurance.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function assertGuard({ shared, policy, claim, atomic, policyDetail, insuranceApi }) {
  const errs = [];

  if (!shared?.includes("export async function resolveMdataAssetId")) {
    errs.push(`${SHARED}: must export resolveMdataAssetId`);
  }
  if (!shared?.includes("a.unit_id = $2::uuid")) {
    errs.push(`${SHARED}: bridge SQL must match assets by unit_id`);
  }
  if (!shared?.includes("a.unit_code IN (SELECT u.unit_number")) {
    errs.push(`${SHARED}: bridge SQL must match assets by units.unit_number`);
  }

  for (const [file, src] of [
    [POLICY, policy],
    [CLAIM, claim],
    [ATOMIC, atomic],
  ]) {
    if (!src?.includes('from "./resolve-asset-id.shared.js"')) {
      errs.push(`${file}: must import resolveMdataAssetId from shared module`);
    }
    if (!src?.includes("resolveMdataAssetId(")) {
      errs.push(`${file}: must call resolveMdataAssetId before persisting asset_id`);
    }
  }

  if (claim && !/resolvedAssetId/.test(claim)) {
    errs.push(`${CLAIM}: claim create must store resolvedAssetId, not raw body.asset_id`);
  }
  if (atomic && !/resolvedAssetId/.test(atomic)) {
    errs.push(`${ATOMIC}: atomic policy create must INSERT resolved asset ids`);
  }
  if (policy && !/resolvedAssetId/.test(policy)) {
    errs.push(`${POLICY}: policy unit add must resolve unit id before INSERT`);
  }

  if (policy && !/COALESCE\(a\.unit_id::text, u\.id::text\) AS unit_id/.test(policy)) {
    errs.push(`${POLICY}: GET policy must expose unit_id on policy units`);
  }

  if (insuranceApi && !/unit_id\?: string \| null/.test(insuranceApi)) {
    errs.push(`${INSURANCE_API}: InsurancePolicyUnit must include unit_id`);
  }
  if (policyDetail && (!/unit\.unit_id/.test(policyDetail) || !/kind="unit"/.test(policyDetail))) {
    errs.push(`${POLICY_DETAIL}: must drill through fleet via unit_id EntityLink`);
  }

  return errs;
}

function selftest() {
  const goodShared = `
    export async function resolveMdataAssetId
    a.unit_id = $2::uuid
    a.unit_code IN (SELECT u.unit_number
  `;
  const goodRoute = `
    import { resolveMdataAssetId } from "./resolve-asset-id.shared.js";
    const resolvedAssetId = await resolveMdataAssetId(client, body.operating_company_id, body.asset_id);
  `;
  const good = assertGuard({
    shared: goodShared,
    policy: goodRoute + " COALESCE(a.unit_id::text, u.id::text) AS unit_id resolvedAssetId ",
    claim: goodRoute + " resolvedAssetId ",
    atomic: goodRoute + " resolvedAssetId ",
    policyDetail: 'unit.unit_id kind="unit"',
    insuranceApi: "unit_id?: string | null",
  });
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL good (${good.length})`);
    process.exit(1);
  }
  const bad = assertGuard({
    shared: goodShared,
    policy: "// no import",
    claim: goodRoute,
    atomic: goodRoute,
  });
  if (bad.length < 2) {
    console.error(`${LABEL} --selftest FAIL bad (${bad.length})`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errs = assertGuard({
  shared: read(SHARED),
  policy: read(POLICY),
  claim: read(CLAIM),
  atomic: read(ATOMIC),
  policyDetail: read(POLICY_DETAIL),
  insuranceApi: read(INSURANCE_API),
});
if ([SHARED, POLICY, CLAIM, ATOMIC, POLICY_DETAIL, INSURANCE_API].some((f) => read(f) == null)) {
  console.error(`[${LABEL}] FAILED — missing source file`);
  process.exit(1);
}
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — insurance write paths bridge units.id → mdata.assets.id`);
