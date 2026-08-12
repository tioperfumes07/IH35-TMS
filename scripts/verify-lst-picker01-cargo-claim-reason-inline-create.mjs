#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — CargoClaimIntakeSurface claim reason must use ReferenceSelect with
 * createKind=cargo_claim_reason (same-table write to catalogs.cargo_claim_reasons).
 * Cursor even claim: 1822.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-cargo-claim-reason-inline-create";

const PAGE = "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const ROUTES = "apps/backend/src/catalogs/safety/cargo-claim-reasons.routes.ts";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const page = readRel(root, PAGE);
  const registry = readRel(root, REGISTRY);
  const routes = readRel(root, ROUTES);

  if (!page) problems.push(`missing ${PAGE}`);
  else {
    const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/createKind=["']cargo_claim_reason["']/.test(code)) {
      problems.push(`${PAGE}: claim reason must use createKind=cargo_claim_reason`);
    }
    if (!/ReferenceSelect/.test(code)) {
      problems.push(`${PAGE}: must import/use ReferenceSelect`);
    }
    if (!/claim_reason_id:\s*form\.claimReasonId/.test(code)) {
      problems.push(`${PAGE}: create payload must submit canonical claim_reason_id UUID`);
    }
    if (!/value:\s*String\(r\.id\)/.test(code)) {
      problems.push(`${PAGE}: reason options must be keyed by catalog UUID`);
    }
    if (/data-testid=\{`\$\{pageTestId\}-reason`\}[\s\S]{0,120}<select/.test(code) || /claimReasonId[\s\S]{0,200}<option value="">— Select reason/.test(code)) {
      problems.push(`${PAGE}: must not keep bare <select> dual path for claim reason`);
    }
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else {
    if (!/cargo_claim_reason:\s*\{/.test(registry)) {
      problems.push(`${REGISTRY}: missing cargo_claim_reason entry`);
    }
    if (!/writeTable:\s*"catalogs\.cargo_claim_reasons"/.test(registry)) {
      problems.push(`${REGISTRY}: writeTable must be catalogs.cargo_claim_reasons`);
    }
    if (!/\/api\/v1\/catalogs\/safety\/cargo-claim-reasons/.test(registry)) {
      problems.push(`${REGISTRY}: must POST safety/cargo-claim-reasons`);
    }
    if (!/reason_code/.test(registry) || !/claim_category/.test(registry)) {
      problems.push(`${REGISTRY}: create must POST reason_code + claim_category`);
    }
    if (/listCargoClaimReasons/.test(registry)) {
      problems.push(`${REGISTRY}: must not contain listCargoClaimReasons literal (selftest landmine)`);
    }
  }

  if (!routes) problems.push(`missing ${ROUTES}`);
  else if (!/INSERT INTO catalogs\.cargo_claim_reasons/.test(routes) || !/FROM catalogs\.cargo_claim_reasons/.test(routes)) {
    problems.push(`${ROUTES}: must SELECT+INSERT catalogs.cargo_claim_reasons (VERIFY-2 cl.5)`);
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — CargoClaimIntakeSurface claim reason inline create`);
}
