#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — Book Load ExpectedAdjustmentsCallout detention reason must use
 * ReferenceSelect with createKind=detention_reason (same-table write to catalogs.detention_reasons).
 * Cursor even claim: 1848.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-detention-reason-inline-create";

const CALLOUT = "apps/frontend/src/pages/dispatch/components/book-load-v4/ExpectedAdjustmentsCallout.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const ROUTES = "apps/backend/src/catalogs/dispatch/detention-reasons.routes.ts";
const SHARED = "apps/backend/src/catalogs/dispatch/shared.ts";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @param {Record<string, string>} [overrides] */
export function collectProblems(root = ROOT, overrides = {}) {
  const problems = [];
  const callout = overrides[CALLOUT] ?? readRel(root, CALLOUT);
  const registry = readRel(root, REGISTRY);
  const routes = readRel(root, ROUTES);
  const shared = readRel(root, SHARED);

  if (!callout) problems.push(`missing ${CALLOUT}`);
  else {
    const code = callout.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/createKind=["']detention_reason["']/.test(code)) {
      problems.push(`${CALLOUT}: detention reason must use createKind=detention_reason`);
    }
    if (!/ReferenceSelect/.test(code)) {
      problems.push(`${CALLOUT}: must import/use ReferenceSelect`);
    }
    if (!/createdValueField=["']id["']/.test(code) || !/value:\s*row\.id/.test(code)) {
      problems.push(`${CALLOUT}: must select the canonical UUID (createdValueField=id)`);
    }
    if (!/detentionReasonsCatalogClient/.test(code)) {
      problems.push(`${CALLOUT}: must list from detentionReasonsCatalogClient (same table as POST)`);
    }
    if (!/invalidateQueries|refetch/.test(code)) {
      problems.push(`${CALLOUT}: must invalidate/refetch detention-reasons query after inline create`);
    }
    if (/<SelectCombobox[\s\S]{0,280}detention_reason|detentionReasonOptions[\s\S]{0,120}<option/.test(code)) {
      problems.push(`${CALLOUT}: must not keep SelectCombobox dual path for detention reason`);
    }
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else {
    if (!/detention_reason:\s*catalogEntry\(/.test(registry) && !/detention_reason:\s*\{/.test(registry)) {
      problems.push(`${REGISTRY}: missing detention_reason entry`);
    }
    if (!/table:\s*"catalogs\.detention_reasons"/.test(registry)) {
      problems.push(`${REGISTRY}: table must be catalogs.detention_reasons`);
    }
    if (!/\/api\/v1\/catalogs\/dispatch\/detention-reasons/.test(registry)) {
      problems.push(`${REGISTRY}: must POST dispatch/detention-reasons`);
    }
  }

  if (!routes) problems.push(`missing ${ROUTES}`);
  else if (!/tableName:\s*"detention_reasons"/.test(routes)) {
    problems.push(`${ROUTES}: must register tableName detention_reasons`);
  }

  if (!shared) problems.push(`missing ${SHARED}`);
  else if (!/INSERT INTO \$\{tableName\}/.test(shared) || !/FROM \$\{tableName\}/.test(shared)) {
    problems.push(`${SHARED}: dispatch catalog factory must SELECT+INSERT same tableName (VERIFY-2 cl.5)`);
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL (baseline must be clean):`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const callout = readRel(ROOT, CALLOUT);
  const brokenKind = callout.replace(/createKind=["']detention_reason["']/, 'createKind="vendor"');
  const kindProblems = collectProblems(ROOT, { [CALLOUT]: brokenKind });
  if (kindProblems.length === 0) {
    console.error(`${LABEL} SELFTEST FAIL: planted createKind=vendor mutation did not fail`);
    process.exit(1);
  }

  const brokenClient = callout.replace(/detentionReasonsCatalogClient/g, "loadTypesCatalogClient");
  const clientProblems = collectProblems(ROOT, { [CALLOUT]: brokenClient });
  if (clientProblems.length === 0) {
    console.error(`${LABEL} SELFTEST FAIL: planted catalog client mutation did not fail`);
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
  console.log(`${LABEL} OK — Book Load detention reason inline create → catalogs.detention_reasons`);
}
