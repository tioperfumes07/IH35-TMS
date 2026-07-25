#!/usr/bin/env node
/**
 * GUARD (Lists block 14): account_types / wo_cancellation_reasons / tire_positions stay GLOBAL-BY-DESIGN.
 * Asserts count-spec companyScoped:false (where listed) and no HELD migration company-scopes them.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-global-by-design-catalogs";
const GLOBAL = ["account_types", "wo_cancellation_reasons", "tire_positions"];
const SPEC = "apps/backend/src/lists/lists-module-count-spec.ts";
const REGISTRY = "docs/trackers/GLOBAL-BY-DESIGN-CATALOGS-2026-07-25.md";
const WIRING = "docs/trackers/FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function assertGlobalByDesign(sources) {
  const problems = [];
  const spec = sources[SPEC] ?? read(SPEC);
  const registry = sources[REGISTRY] ?? read(REGISTRY);
  const wiring = sources[WIRING] ?? read(WIRING);

  for (const table of GLOBAL) {
    if (!registry.includes(table)) {
      problems.push(`${REGISTRY}: missing ${table}`);
    }
    if (!new RegExp(`catalogs\\.${table}[\\s\\S]{0,240}GLOBAL-BY-DESIGN`).test(wiring)) {
      problems.push(`${WIRING}: catalogs.${table} must be annotated GLOBAL-BY-DESIGN`);
    }
  }

  // account_types + tire_positions are in count-spec; must stay companyScoped:false
  for (const table of ["account_types", "tire_positions"]) {
    const re = new RegExp(`table:\\s*"${table}"[^\\n]*companyScoped:\\s*(true|false)`);
    const m = spec.match(re);
    if (!m) {
      problems.push(`${SPEC}: missing count-spec row for ${table}`);
    } else if (m[1] !== "false") {
      problems.push(`${SPEC}: ${table} must remain companyScoped:false (GLOBAL-BY-DESIGN)`);
    }
  }

  // No migration may ADD operating_company_id to these three.
  const migDir = path.join(ROOT, "db/migrations");
  for (const file of fs.readdirSync(migDir).filter((f) => f.endsWith(".sql"))) {
    const body = fs.readFileSync(path.join(migDir, file), "utf8");
    for (const table of GLOBAL) {
      const addsOpco = new RegExp(
        `ALTER TABLE\\s+catalogs\\.${table}\\s+ADD COLUMN(?: IF NOT EXISTS)?\\s+operating_company_id`,
        "i"
      ).test(body);
      if (addsOpco) {
        problems.push(`${file}: must not ADD operating_company_id to GLOBAL-BY-DESIGN ${table}`);
      }
    }
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = { [SPEC]: read(SPEC), [REGISTRY]: read(REGISTRY), [WIRING]: read(WIRING) };
  const broken = {
    ...real,
    [SPEC]: real[SPEC].replace(
      /table:\s*"account_types", activeFilter: "is_active", companyScoped:\s*false/,
      'table: "account_types", activeFilter: "is_active", companyScoped: true'
    ),
  };
  if (!assertGlobalByDesign(broken).some((p) => p.includes("account_types"))) {
    console.error(`${LABEL} --selftest FAIL: companyScoped flip not flagged`);
    process.exit(1);
  }
  const good = assertGlobalByDesign(real);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL:\n${good.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = assertGlobalByDesign({});
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — three GLOBAL-BY-DESIGN catalogs registered + count-spec locked.`);
}
