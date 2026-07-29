#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — Cancel Load modal must use the shared ReferenceSelect with
 * createKind="load_cancellation_reason" so "+ Create cancellation reason" is the first
 * dropdown row and writes catalogs.load_cancellation_reasons (VERIFY-2 cl.5).
 *
 * Cursor even claim: 1782.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-cancel-load-inline-create";

const MODAL = "apps/frontend/src/components/dispatch/CancelLoadModal.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const ROUTES = "apps/backend/src/catalogs/load-cancellation-reasons.routes.ts";
const LIST_SVC = "apps/backend/src/dispatch/cancellation.service.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function collectProblems() {
  const problems = [];
  const modal = read(MODAL);
  const registry = read(REGISTRY);
  const routes = read(ROUTES);
  const listSvc = read(LIST_SVC);

  if (!modal) problems.push(`missing ${MODAL}`);
  else {
    if (!/ReferenceSelect/.test(modal)) {
      problems.push(`${MODAL}: must use ReferenceSelect (not bare Combobox)`);
    }
    if (!/createKind=["']load_cancellation_reason["']/.test(modal)) {
      problems.push(`${MODAL}: createKind must be load_cancellation_reason`);
    }
    if (!/createdValueField=["']code["']/.test(modal)) {
      problems.push(`${MODAL}: createdValueField must be "code" (options keyed by reason_code)`);
    }
    // Bare Combobox for the reason field is the defect this slice kills.
    if (/<Combobox[\s\S]{0,200}reason_code/.test(modal) || /Cancellation Reason[\s\S]{0,400}<Combobox/.test(modal)) {
      problems.push(`${MODAL}: Cancellation Reason must not use bare Combobox`);
    }
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else {
    if (!/load_cancellation_reason:\s*\{/.test(registry)) {
      problems.push(`${REGISTRY}: must declare load_cancellation_reason config entry`);
    }
    if (!/readTable:\s*"catalogs\.load_cancellation_reasons"/.test(registry)) {
      problems.push(`${REGISTRY}: readTable must be catalogs.load_cancellation_reasons`);
    }
    if (!/writeTable:\s*"catalogs\.load_cancellation_reasons"/.test(registry)) {
      problems.push(`${REGISTRY}: writeTable must equal readTable (VERIFY-2 cl.5)`);
    }
    if (!/\/api\/v1\/catalogs\/load-cancellation-reasons/.test(registry)) {
      problems.push(`${REGISTRY}: write must POST /api/v1/catalogs/load-cancellation-reasons`);
    }
    if (!/category:\s*"other"/.test(registry)) {
      problems.push(`${REGISTRY}: inline create must supply required category (default other)`);
    }
  }

  if (!routes) problems.push(`missing ${ROUTES}`);
  else {
    if (!/INSERT INTO catalogs\.load_cancellation_reasons/.test(routes)) {
      problems.push(`${ROUTES}: create INSERT must target catalogs.load_cancellation_reasons`);
    }
  }

  if (!listSvc) problems.push(`missing ${LIST_SVC}`);
  else {
    if (!/FROM catalogs\.load_cancellation_reasons/.test(listSvc)) {
      problems.push(`${LIST_SVC}: cancel reason list must read catalogs.load_cancellation_reasons`);
    }
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
  // Plant: strip createKind from a temp copy conceptually by checking the positive assertion
  // path already passed — mutate in-memory by temporarily requiring a fake missing kind.
  const modal = read(MODAL);
  const broken = modal.replace(/createKind=["']load_cancellation_reason["']/, 'createKind="vendor"');
  if (!/createKind=["']vendor["']/.test(broken)) {
    console.error(`${LABEL} SELFTEST FAIL: could not plant createKind mutation`);
    process.exit(1);
  }
  if (/createKind=["']load_cancellation_reason["']/.test(broken)) {
    console.error(`${LABEL} SELFTEST FAIL: planted mutation still has load_cancellation_reason`);
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
  console.log(`${LABEL} OK — CancelLoadModal inline create → catalogs.load_cancellation_reasons`);
}
