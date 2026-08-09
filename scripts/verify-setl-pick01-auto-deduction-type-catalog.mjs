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
const HOOK = "apps/frontend/src/hooks/useDriverDeductionTypeCatalog.ts";
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

export function collectProblems(
  sources = {
    panel: read(PANEL),
    hook: fs.existsSync(path.join(ROOT, HOOK)) ? read(HOOK) : "",
    routes: read(ROUTES),
    migration: read(MIGRATION),
  }
) {
  const problems = [];
  const panel = stripComments(sources.panel);
  const hook = stripComments(sources.hook || "");
  const routes = stripComments(sources.routes);
  const readSurface = `${sources.panel}\n${sources.hook || ""}`;

  const legacyHits = LEGACY.filter((v) => panel.includes(`"${v}"`));
  if (legacyHits.length >= 3) {
    problems.push(`${PANEL}: hardcoded legacy deduction type literals remain (${legacyHits.join(", ")})`);
  }
  // Direct client in panel OR shared hook that wraps driverDeductionTypesCatalogClient (SETL-PICK-01 helper).
  const panelUsesClient = /driverDeductionTypesCatalogClient/.test(sources.panel);
  const panelUsesHook = /useDriverDeductionTypeCatalog/.test(sources.panel);
  const hookUsesClient = /driverDeductionTypesCatalogClient\.list/.test(hook);
  if (!panelUsesClient && !(panelUsesHook && hookUsesClient)) {
    problems.push(
      `${PANEL}: must load options via driverDeductionTypesCatalogClient or useDriverDeductionTypeCatalog (catalogs.driver_deduction_types)`
    );
  }
  if (
    !/\/api\/v1\/catalogs\/driver\/deduction-types/.test(readSurface) &&
    !/driverDeductionTypesCatalogClient\.list/.test(readSurface)
  ) {
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

  // SETL-LINK-01 — catalog recovery metadata must not be dead weight on the create/list surfaces.
  if (!/default_recovery_rail/.test(sources.panel) || !/may_draw_escrow/.test(sources.panel)) {
    problems.push(
      `${PANEL}: SETL-LINK-01 — must consume default_recovery_rail + may_draw_escrow from catalogs.driver_deduction_types`
    );
  }
  if (!/auto-deduction-recovery-rail-field/.test(sources.panel) && !/Recovery rail/.test(sources.panel)) {
    problems.push(`${PANEL}: SETL-LINK-01 — must render the mandatory recovery-rail ask pre-selected from catalog`);
  }
  if (!/recoveryMetaByCode|buildDriverDeductionTypeRecoveryMetaMap|recoveryRailOptionsForMeta/.test(readSurface)) {
    problems.push(
      `${HOOK}: SETL-LINK-01 — hook must expose recovery metadata map / rail option filter for catalog rows`
    );
  }
  if (!/LEFT JOIN catalogs\.driver_deduction_types/.test(routes) || !/ddt\.default_recovery_rail/.test(routes)) {
    problems.push(
      `${ROUTES}: SETL-LINK-01 — list policies must JOIN catalogs.driver_deduction_types for default_recovery_rail`
    );
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = {
    panel: read(PANEL),
    hook: fs.existsSync(path.join(ROOT, HOOK)) ? read(HOOK) : "",
    routes: read(ROUTES),
    migration: read(MIGRATION),
  };
  const broken = {
    ...real,
    panel: `const DEDUCTION_TYPES = ["damage", "cash_advance", "repair", "fine", "fuel_advance", "other"];`,
    hook: "",
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
