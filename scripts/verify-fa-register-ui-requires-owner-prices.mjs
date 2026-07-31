#!/usr/bin/env node
/**
 * ND-FA-01 — Fixed Assets register UI must POST register-trk-units with owner pricesByUnitNumber.
 * Never invent purchase prices; fail closed on empty map. Cursor even claim: 1844.
 *
 *   node scripts/verify-fa-register-ui-requires-owner-prices.mjs
 *   node scripts/verify-fa-register-ui-requires-owner-prices.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fa-register-ui-requires-owner-prices";

const API = "apps/frontend/src/api/fixed-assets.ts";
const PAGE = "apps/frontend/src/pages/accounting/FixedAssetsPage.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const api = readRel(root, API);
  const page = readRel(root, PAGE);

  if (!api) problems.push(`missing ${API}`);
  else {
    if (!/register-trk-units/.test(api)) {
      problems.push(`${API}: must POST /api/v1/accounting/fixed-assets/register-trk-units`);
    }
    if (!/register-unit/.test(api)) {
      problems.push(`${API}: must POST /api/v1/accounting/fixed-assets/register-unit`);
    }
    if (!/pricesByUnitNumber/.test(api)) {
      problems.push(`${API}: RegisterTrkUnitsInput must include pricesByUnitNumber`);
    }
    if (!/registerTrkOwnedUnits/.test(api)) {
      problems.push(`${API}: must export registerTrkOwnedUnits()`);
    }
  }

  if (!page) problems.push(`missing ${PAGE}`);
  else {
    const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/registerTrkOwnedUnits/.test(code)) {
      problems.push(`${PAGE}: must call registerTrkOwnedUnits`);
    }
    if (!/pricesByUnitNumber/.test(code)) {
      problems.push(`${PAGE}: submit payload must include pricesByUnitNumber`);
    }
    if (!/Object\.keys\(\s*pricesMap\s*\)\.length/.test(code)) {
      problems.push(`${PAGE}: must gate submit on non-empty prices map (Object.keys(pricesMap).length)`);
    }
    if (!/disabled=\{[^}]*Object\.keys\(\s*pricesMap\s*\)\.length\s*===\s*0/.test(code)) {
      problems.push(`${PAGE}: register action must be disabled when prices map is empty`);
    }
    if (/DEFAULT_(?:PURCHASE_)?PRICE|invent(?:ed|ing)?\s+(?:price|dollar)/i.test(code)) {
      problems.push(`${PAGE}: must not invent default purchase prices`);
    }
    if (/pricesByUnitNumber:\s*\{\s*\}/.test(code)) {
      problems.push(`${PAGE}: must not submit empty pricesByUnitNumber object`);
    }
    if (!/missing_price/.test(code)) {
      problems.push(`${PAGE}: must surface missing_price in register results`);
    }
  }

  return problems;
}

function selftest() {
  const goodApi = [
    "export function registerTrkOwnedUnits(body: RegisterTrkUnitsInput)",
    "pricesByUnitNumber: Record<string, number>",
    "/api/v1/accounting/fixed-assets/register-trk-units",
    "/api/v1/accounting/fixed-assets/register-unit",
    "registerFixedAssetUnit",
  ].join("\n");
  const goodPage = [
    "registerTrkOwnedUnits({",
    "pricesByUnitNumber: pricesMap",
    "Object.keys(pricesMap).length",
    "disabled={registerMutation.isPending || Object.keys(pricesMap).length === 0}",
    "missing_price",
  ].join("\n");

  const tmp = fs.mkdtempSync(path.join(ROOT, ".selftest-fa-register-"));
  try {
    fs.mkdirSync(path.join(tmp, path.dirname(API)), { recursive: true });
    fs.mkdirSync(path.join(tmp, path.dirname(PAGE)), { recursive: true });
    fs.writeFileSync(path.join(tmp, API), goodApi);
    fs.writeFileSync(path.join(tmp, PAGE), goodPage);
    if (collectProblems(tmp).length) {
      console.error(`${LABEL} --selftest FAIL good tree:`, collectProblems(tmp));
      process.exit(1);
    }

    fs.writeFileSync(path.join(tmp, PAGE), goodPage.replace("pricesByUnitNumber: pricesMap", "// no prices"));
    if (!collectProblems(tmp).some((p) => p.includes("pricesByUnitNumber"))) {
      console.error(`${LABEL} --selftest FAIL missing pricesByUnitNumber not caught`);
      process.exit(1);
    }

    fs.writeFileSync(path.join(tmp, PAGE), goodPage + "\nconst DEFAULT_PURCHASE_PRICE = 1;");
    if (!collectProblems(tmp).some((p) => p.includes("invent"))) {
      console.error(`${LABEL} --selftest FAIL invented default price not caught`);
      process.exit(1);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const problems = collectProblems();
if (problems.length) {
  console.error(`${LABEL}: FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Fixed Assets register UI requires owner pricesByUnitNumber (live density UNVERIFIED until owner apply)`);
process.exit(0);
