#!/usr/bin/env node
/**
 * verify-property-tax-candidate-assets-lease-scope.mjs (COMP-F6310)
 *
 * Root cause: `apps/backend/src/compliance/property-tax/property-tax.service.ts`'s
 * `listCandidateAssets()` — feeding the Business Property Tax Rendition detail page's "+ Create
 * Line" asset picker — filtered `mdata.units`/`mdata.equipment` by `owner_company_id` only. Every
 * real USMCA (and TRANSP) fleet unit/trailer is LEASED, not owned (TRK=owner, TRANSP/USMCA=lease
 * per config/samsara-carrier-attribution.json). Live-confirmed via Neon prod: 0 owned / 44 leased
 * units, 0 owned / 6 leased equipment on USMCA — the picker had ZERO real options for any
 * leased-fleet entity, live-reproduced on `/compliance/property-tax/:id` (DOM read: the
 * "Select unit/trailer…" <select> had exactly 1 option, the placeholder itself).
 *
 * Fix: scope both queries by `COALESCE(currently_leased_to_company_id, owner_company_id)` — the
 * same canonical entity-scope predicate already used elsewhere in the codebase (e.g.
 * `dashboard.routes.ts`'s severe-alerts/rm-status queries, `work-orders.service.ts`).
 *
 * Usage:
 *   node scripts/verify-property-tax-candidate-assets-lease-scope.mjs            # scan
 *   node scripts/verify-property-tax-candidate-assets-lease-scope.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILE = "apps/backend/src/compliance/property-tax/property-tax.service.ts";

const UNITS_OWNER_ONLY_RE = /FROM mdata\.units\s*\n\s*WHERE owner_company_id = \$1::uuid/;
const EQUIP_OWNER_ONLY_RE = /FROM mdata\.equipment\s*\n\s*WHERE owner_company_id = \$1::uuid/;
const UNITS_LEASE_SCOPED_RE = /FROM mdata\.units\s*\n\s*WHERE COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$1::uuid/;
const EQUIP_LEASE_SCOPED_RE = /FROM mdata\.equipment\s*\n\s*WHERE COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$1::uuid/;

export function checkPropertyTaxLeaseScope(src) {
  const offenders = [];
  if (!/function listCandidateAssets/.test(src)) {
    offenders.push(`${FILE}: listCandidateAssets() not found — regression file rewritten unexpectedly.`);
    return offenders;
  }
  if (UNITS_OWNER_ONLY_RE.test(src)) {
    offenders.push(`${FILE}: mdata.units candidate-asset query still filters by owner_company_id only — 0 rows for any leased-fleet entity (USMCA/TRANSP) again.`);
  }
  if (EQUIP_OWNER_ONLY_RE.test(src)) {
    offenders.push(`${FILE}: mdata.equipment candidate-asset query still filters by owner_company_id only — 0 rows for any leased-fleet entity (USMCA/TRANSP) again.`);
  }
  if (!UNITS_LEASE_SCOPED_RE.test(src)) {
    offenders.push(`${FILE}: mdata.units candidate-asset query is not scoped by COALESCE(currently_leased_to_company_id, owner_company_id).`);
  }
  if (!EQUIP_LEASE_SCOPED_RE.test(src)) {
    offenders.push(`${FILE}: mdata.equipment candidate-asset query is not scoped by COALESCE(currently_leased_to_company_id, owner_company_id).`);
  }
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, FILE), "utf8");
  const offenders = checkPropertyTaxLeaseScope(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    export async function listCandidateAssets(client, operatingCompanyId) {
      const unitsRes = await client.query(
        \`SELECT id::text, unit_number
         FROM mdata.units
         WHERE owner_company_id = $1::uuid AND deactivated_at IS NULL
         ORDER BY unit_number
         LIMIT 500\`,
        [operatingCompanyId]
      );
      const equipRes = await client.query(
        \`SELECT id::text, equipment_number
         FROM mdata.equipment
         WHERE owner_company_id = $1::uuid AND deactivated_at IS NULL
         ORDER BY equipment_number
         LIMIT 500\`,
        [operatingCompanyId]
      );
    }
  `;
  const fixed = fs.readFileSync(path.join(repoRoot, FILE), "utf8");

  const buggyOffenders = checkPropertyTaxLeaseScope(buggy);
  const fixedOffenders = checkPropertyTaxLeaseScope(fixed);

  if (buggyOffenders.length >= 4 && fixedOffenders.length === 0) {
    console.log("verify-property-tax-candidate-assets-lease-scope selftest OK");
    process.exit(0);
  }
  console.error("verify-property-tax-candidate-assets-lease-scope selftest FAILED", { buggyOffenders, fixedOffenders });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-property-tax-candidate-assets-lease-scope FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-property-tax-candidate-assets-lease-scope OK — listCandidateAssets() scopes both mdata.units/mdata.equipment queries by COALESCE(currently_leased_to_company_id, owner_company_id)",
  );
}
