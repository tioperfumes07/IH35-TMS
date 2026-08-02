#!/usr/bin/env node
/**
 * SETL-PICK-01 / VERIFY-2 — AutoDeductionPolicies Type picker must read catalogs.driver_deduction_types,
 * never the legacy hardcoded snake_case enum.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PANEL = "apps/frontend/src/pages/drivers/AutoDeductionPolicies.tsx";
const ROUTES = "apps/backend/src/settlements/auto-deductions/policy.routes.ts";
const MIGRATION = "db/migrations/202611151200_auto_deduction_policy_deduction_type_catalog_fk.sql";
const LABEL = "verify-setl-pick01-auto-deduction-type-catalog";

/** Legacy frozen enum members — three together is unmistakably the old hardcoded list. */
const LEGACY = ["damage", "cash_advance", "repair", "fine", "fuel_advance", "other"];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

export function collectProblems(sources = { panel: read(PANEL), routes: read(ROUTES), migration: read(MIGRATION) }) {
  const problems = [];
  const panel = stripComments(sources.panel);
  const routes = stripComments(sources.routes);

  const legacyHits = LEGACY.filter((v) => panel.includes(`"${v}"`));
  if (legacyHits.length >= 3) {
    problems.push(`${PANEL}: hardcoded legacy deduction type literals remain (${legacyHits.join(", ")})`);
  }
  if (!/driverDeductionTypesCatalogClient/.test(sources.panel)) {
    problems.push(`${PANEL}: must load options via driverDeductionTypesCatalogClient (catalogs.driver_deduction_types)`);
  }
  if (!/\/api\/v1\/catalogs\/driver\/deduction-types/.test(sources.panel) && !/driverDeductionTypesCatalogClient\.list/.test(sources.panel)) {
    problems.push(`${PANEL}: must call the canonical deduction-types catalog list API`);
  }
  if (/DEDUCTION_TYPES\s*=/.test(panel)) {
    problems.push(`${PANEL}: DEDUCTION_TYPES frozen array must be removed`);
  }
  if (/z\.enum\(\["damage"/.test(routes) || /z\.enum\(\[\s*"damage"/.test(routes)) {
    problems.push(`${ROUTES}: deduction_type must not use the legacy z.enum(["damage", ...])`);
  }
  if (!/catalogs\.driver_deduction_types/.test(sources.migration)) {
    problems.push(`${MIGRATION}: must FK auto_deduction_policies.deduction_type → catalogs.driver_deduction_types`);
  }
  if (!/auto_deduction_policies_deduction_type_catalog_fkey/.test(sources.migration)) {
    problems.push(`${MIGRATION}: must add auto_deduction_policies_deduction_type_catalog_fkey`);
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = { panel: read(PANEL), routes: read(ROUTES), migration: read(MIGRATION) };
  const broken = {
    ...real,
    panel: `const DEDUCTION_TYPES = ["damage", "cash_advance", "repair", "fine", "fuel_advance", "other"];`,
    routes: real.routes.replace(/z\.string\(\)/, 'z.enum(["damage", "cash_advance", "repair", "fine", "fuel_advance", "other"])'),
  };
  if (collectProblems(broken).length === 0) {
    console.error(`${LABEL} --selftest FAIL: broken sources not flagged`);
    process.exit(1);
  }
  const good = collectProblems(real);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL:\n${good.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — AutoDeductionPolicies reads catalogs.driver_deduction_types; legacy enum removed.`);
}
