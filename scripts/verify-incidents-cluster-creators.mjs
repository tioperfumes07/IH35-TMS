#!/usr/bin/env node
/**
 * SC-CLUSTER regression guard — the safety incidents cluster (Damage Reports, Trailer
 * Interchanges, Cargo Claims) is ONE shared surface (SafetyIncidentsClusterSurface.tsx) driven
 * by a per-incident-type field config. Before this block its saveCreate() sent only
 * location + description; this guard fails on any regression to that stub and asserts each of
 * the three configs declares its type-specific fields.
 *
 * Replaces the separate per-tab guards specified in BLOCK_SC2 / SC4 Part C (one guard for the
 * one shared root). Intentionally static (grep-style) and negative-testable: it FAILS on the
 * pre-fix code (no listDrivers/listUnits, no typed fields) and PASSES on the fixed code.
 * Wired into `verify:arch-design`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SURFACE = "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx";
const CONFIGS = [
  {
    file: "apps/frontend/src/pages/safety/DamageReportsPage.tsx",
    type: "damage_report",
    fields: ["damage_amount_cents"],
  },
  {
    file: "apps/frontend/src/pages/safety/TrailerInterchangesPage.tsx",
    type: "trailer_interchange",
    fields: ["interchange_party"],
    required: "trailer_id",
  },
  {
    file: "apps/frontend/src/pages/safety/CargoClaimsPage.tsx",
    type: "cargo_claim",
    fields: ["claimant_customer_id", "claim_reason_code", "claim_filed_at"],
  },
];

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error(`[verify-incidents-cluster-creators] FAILED — expected file not found: ${rel}`);
    process.exit(1);
  }
  return fs.readFileSync(abs, "utf8");
}

const failures = [];
const src = read(SURFACE);

// (1) Pickers wired from the company-scoped roster APIs.
if (!/\blistDrivers\b/.test(src)) failures.push("surface must import/use listDrivers (driver picker).");
if (!/\blistUnits\b/.test(src)) failures.push("surface must import/use listUnits (unit + trailer pickers).");
// limit:200 avoids the driver-picker 50-cap truncation.
if (!/limit:\s*200/.test(src)) failures.push("pickers must pass limit:200 (avoid the 50-cap truncation).");

// (2) saveCreate must send the linked identifiers, not regress to location+description-only.
const saveIdx = src.indexOf("const saveCreate");
const saveBody = saveIdx >= 0 ? src.slice(saveIdx, saveIdx + 2500) : "";
for (const key of ["incident_at", "driver_id", "unit_id", "trailer_id"]) {
  if (!new RegExp(`${key}:`).test(saveBody)) {
    failures.push(`saveCreate must send ${key} (regression to location+description-only).`);
  }
}
if (!/damage_amount_cents/.test(src)) failures.push("surface must handle damage_amount_cents (dollars→cents).");

// (3) Disabled Save must state which required fields are missing (no silent dead control).
if (!/missingFields/.test(src)) {
  failures.push("no missingFields helper — the disabled Save must state why it is disabled.");
}
if (!/missingFields\.join\(/.test(src)) {
  failures.push("missing-fields helper text not rendered (expected missingFields.join(...)).");
}
// Disabled-state is actually bound to the missing set.
if (!/disabled=\{missingFields\.length/.test(src)) {
  failures.push("Save button disabled state must be bound to missingFields.length.");
}

// (4) Each of the three configs declares its type-specific fields (typedFields).
for (const cfg of CONFIGS) {
  const cfgSrc = read(cfg.file);
  if (!new RegExp(`incidentType:\\s*"${cfg.type}"`).test(cfgSrc)) {
    failures.push(`${cfg.file}: missing incidentType "${cfg.type}".`);
  }
  if (!/typedFields:\s*\[/.test(cfgSrc)) {
    failures.push(`${cfg.file}: config must declare a typedFields array.`);
  }
  for (const f of cfg.fields) {
    if (!cfgSrc.includes(`"${f}"`)) {
      failures.push(`${cfg.file}: typedFields must declare "${f}".`);
    }
  }
  if (cfg.required && !new RegExp(`requiredExtraFields:\\s*\\[[^\\]]*"${cfg.required}"`).test(cfgSrc)) {
    failures.push(`${cfg.file}: requiredExtraFields must include "${cfg.required}".`);
  }
}

// (5) Cargo claim SC4 fields are feature-detected, not hard-sent.
const cargoSrc = read(CONFIGS[2].file);
if (!/sc4GatedFields:\s*\[/.test(cargoSrc)) {
  failures.push("CargoClaimsPage must declare sc4GatedFields (feature-detected SC4 fields).");
}
if (!/sc4GatedFields/.test(src)) {
  failures.push("surface must honor sc4GatedFields (feature-detect the SC4 cargo fields).");
}

if (failures.length > 0) {
  console.error("[verify-incidents-cluster-creators] FAILED — incidents cluster creator regressed:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "[verify-incidents-cluster-creators] OK — shared surface pickers + typed saveCreate + per-type field configs + missing-field helper present."
);
