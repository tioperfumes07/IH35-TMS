#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.assignment_reverse"],"task":"FLEET-CROSS-ENTITY-STALE-ASSIGNMENT-2026-08-23","vertical":"class-sweep"} */
/**
 * FLEET-CROSS-ENTITY-STALE-ASSIGNMENT-2026-08-23: telematics.vehicle_driver_assignments is scoped by
 * operating_company_id, but unit_id is the canonical cross-entity identifier (one mdata.units row can
 * be leased from company A to company B). Root-caused live on prod (tiny-field-89581227): unit T164
 * was re-leased IH 35 Transportation -> USMCA Freight; the Samsara reconciliation upsert in
 * pairing.service.ts closed prior open assignments ONLY within the SAME operating_company_id, so the
 * old IH 35 Transportation-scoped row stayed open (ended_at IS NULL) after the unit moved, and IH 35
 * Transportation's fleet/HOS board kept showing a driver "currently assigned" to a unit it no longer
 * operates. Data corrected (one row closed); this guard holds the write-path fix so it cannot regress.
 *
 * Self-test: node scripts/verify-fleet-cross-entity-assignment-close.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  pairing: "apps/backend/src/integrations/samsara/vehicle-driver-pairing/pairing.service.ts",
};
const LABEL = "verify-fleet-cross-entity-assignment-close";

export function audit(src) {
  const failures = [];
  const fn = src.pairing.match(/async function upsertSamsaraAssignment\([\s\S]*?\n\}\n/);
  if (!fn) {
    failures.push(`${FILES.pairing}: upsertSamsaraAssignment not found`);
    return failures;
  }
  const body = fn[0];
  if (!/unit_id = \$2::uuid[\s\S]{0,20}AND ended_at IS NULL[\s\S]{0,80}operating_company_id != \$1::uuid OR samsara_assignment_id IS DISTINCT FROM \$3/.test(body)) {
    failures.push(
      `${FILES.pairing}: the pre-insert close of a unit's prior open assignment must close it across ` +
        `ANY operating_company_id (not scoped to the current entity only), or a cross-entity re-lease ` +
        `leaves a stale "currently assigned" row on the old entity's fleet/HOS board`,
    );
  }
  return failures;
}

function loadSrc(root) {
  return {
    pairing: fs.readFileSync(path.join(root, FILES.pairing), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    [
      "reintroduce-same-entity-only-scope",
      "pairing",
      /WHERE unit_id = \$2::uuid\s*\n\s*AND ended_at IS NULL\s*\n\s*AND \(operating_company_id != \$1::uuid OR samsara_assignment_id IS DISTINCT FROM \$3\)/,
      "WHERE operating_company_id = $1::uuid\n          AND unit_id = $2::uuid\n          AND ended_at IS NULL\n          AND samsara_assignment_id IS DISTINCT FROM $3",
    ],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutation detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — cross-entity unit re-lease closes the old entity's stale open assignment`);
