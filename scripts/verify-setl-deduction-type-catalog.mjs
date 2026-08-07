#!/usr/bin/env node
/**
 * SETL-PICK-01 / Cascade PICK-006 — Auto-deduction Type picker must read/write
 * catalogs.driver_deduction_types via ReferenceSelect + shared hook (never hardcoded enum).
 * Cursor even claim: 2286.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-setl-deduction-type-catalog";

const PANEL = "apps/frontend/src/pages/drivers/AutoDeductionPolicies.tsx";
const HOOK = "apps/frontend/src/hooks/useDriverDeductionTypeCatalog.ts";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const ROUTES = "apps/backend/src/settlements/auto-deductions/policy.routes.ts";
const MIGRATION = "db/migrations/202611151200_auto_deduction_policy_deduction_type_catalog_fk.sql";
const MODULE_JSON = "docs/module-completion/settlements.json";

/** Legacy frozen enum — three hits together is unmistakably the old hardcoded list. */
const LEGACY = ["damage", "cash_advance", "repair", "fine", "fuel_advance", "other"];

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** @returns {string[]} */
export function collectProblems(sources = {
  panel: read(PANEL),
  hook: read(HOOK),
  registry: read(REGISTRY),
  routes: read(ROUTES),
  migration: read(MIGRATION),
  moduleJson: read(MODULE_JSON),
}) {
  const problems = [];
  const panel = sources.panel ? stripComments(sources.panel) : "";
  const routes = sources.routes ? stripComments(sources.routes) : "";

  if (!sources.panel) problems.push(`missing ${PANEL}`);
  else {
    const legacyHits = LEGACY.filter((v) => panel.includes(`"${v}"`));
    if (legacyHits.length >= 3) {
      problems.push(`${PANEL}: hardcoded legacy deduction type literals (${legacyHits.join(", ")})`);
    }
    if (/DEDUCTION_TYPES\s*=/.test(panel)) {
      problems.push(`${PANEL}: DEDUCTION_TYPES frozen array must be removed`);
    }
    if (!/useDriverDeductionTypeCatalog/.test(sources.panel)) {
      problems.push(`${PANEL}: must load catalog via useDriverDeductionTypeCatalog shared hook`);
    }
    if (!/createKind=["']driver_deduction_type["']/.test(panel)) {
      problems.push(`${PANEL}: Type must use ReferenceSelect createKind=driver_deduction_type`);
    }
    if (!/ReferenceSelect/.test(panel)) {
      problems.push(`${PANEL}: must use ReferenceSelect for Type (not bare SelectCombobox)`);
    }
    if (!/createdValueField=["']code["']/.test(panel)) {
      problems.push(`${PANEL}: must select by catalog code (createdValueField=code)`);
    }
    if (/SelectCombobox[\s\S]{0,400}deductionTypeOptions\.map/.test(panel)) {
      problems.push(`${PANEL}: must not keep SelectCombobox dual path for Type`);
    }
    if (/No deduction types — add in Lists/.test(sources.panel)) {
      problems.push(`${PANEL}: must not send operators to Lists-only path`);
    }
    if (/driverDeductionTypesCatalogClient/.test(sources.panel)) {
      problems.push(`${PANEL}: must not inline driverDeductionTypesCatalogClient — use shared hook`);
    }
  }

  if (!sources.hook) {
    problems.push(`missing ${HOOK}`);
  } else {
    if (!/driverDeductionTypesCatalogClient\.list/.test(sources.hook)) {
      problems.push(`${HOOK}: must list catalogs.driver_deduction_types via driverDeductionTypesCatalogClient`);
    }
    if (!/\/api\/v1\/catalogs\/driver\/deduction-types/.test(sources.hook) && !/driverDeductionTypesCatalogClient/.test(sources.hook)) {
      problems.push(`${HOOK}: must call canonical deduction-types catalog API`);
    }
  }

  if (!sources.registry) problems.push(`missing ${REGISTRY}`);
  else {
    if (!/driver_deduction_type:\s*catalogEntry\(/.test(sources.registry) && !/driver_deduction_type:\s*\{/.test(sources.registry)) {
      problems.push(`${REGISTRY}: missing driver_deduction_type registry entry`);
    }
    if (!/catalogs\.driver_deduction_types/.test(sources.registry)) {
      problems.push(`${REGISTRY}: driver_deduction_type must read/write catalogs.driver_deduction_types`);
    }
  }

  if (sources.routes) {
    if (/z\.enum\(\["damage"/.test(routes) || /z\.enum\(\[\s*"damage"/.test(routes)) {
      problems.push(`${ROUTES}: deduction_type must not use legacy z.enum(["damage", ...])`);
    }
  }

  if (sources.migration) {
    if (!/catalogs\.driver_deduction_types/.test(sources.migration)) {
      problems.push(`${MIGRATION}: must FK auto_deduction_policies.deduction_type → catalogs.driver_deduction_types`);
    }
  }

  if (sources.moduleJson) {
    try {
      const mod = JSON.parse(sources.moduleJson);
      const pick01 = (mod.items ?? []).find((i) => i.id === "SETL-PICK-01");
      if (!pick01) {
        problems.push(`${MODULE_JSON}: missing SETL-PICK-01 checklist item`);
      } else if (pick01.status !== "PASS") {
        problems.push(`${MODULE_JSON}: SETL-PICK-01 must be PASS (found ${pick01.status})`);
      }
    } catch {
      problems.push(`${MODULE_JSON}: invalid JSON`);
    }
  } else {
    problems.push(`missing ${MODULE_JSON}`);
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = {
    panel: read(PANEL),
    hook: read(HOOK),
    registry: read(REGISTRY),
    routes: read(ROUTES),
    migration: read(MIGRATION),
    moduleJson: read(MODULE_JSON),
  };
  const broken = {
    ...real,
    panel: `const DEDUCTION_TYPES = ["damage", "cash_advance", "repair", "fine", "fuel_advance", "other"];
export function AutoDeductionPolicies() {
  return <SelectCombobox aria-label="Deduction type">{deductionTypeOptions.map((t) => null)}</SelectCombobox>;
}`,
    hook: null,
    moduleJson: JSON.stringify({
      items: [{ id: "SETL-PICK-01", status: "OPEN" }],
    }),
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
  console.log(`${LABEL} OK — AutoDeductionPolicies catalog-backed Type picker ratcheted (SETL-PICK-01).`);
}
