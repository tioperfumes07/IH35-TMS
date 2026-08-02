#!/usr/bin/env node
/**
 * GUARD: SAF-F24 — Internal Fines reason picker inline create (Law §4 / VERIFY-2 cl.2).
 *
 * ROOT CAUSE (2026-07-23 audit): InternalFinesPage rendered a <Link to="/lists/safety/internal-fine-reasons">
 * OUTSIDE the dropdown instead of "+ Add new" as the FIRST ROW INSIDE via ReferenceSelect /
 * CatalogQuickCreateDrawer (createKind=internal_fine_reason → POST catalogs.internal_fine_reasons).
 *
 * Cursor even verify-step claim: 2054.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/safety/InternalFinesPage.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const ROUTES = "apps/backend/src/catalogs/safety/internal-fine-reasons.routes.ts";
const LABEL = "verify-safety-f24-internal-fine-reason-picker";
const SELFTEST = process.argv.includes("--selftest");

function readRel(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** @returns {string[]} */
export function collectSafetyF24Problems(root = ROOT) {
  const problems = [];
  const read = (rel) => {
    const p = path.join(root, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  };

  const page = read(PAGE);
  const registry = read(REGISTRY);
  const routes = read(ROUTES);

  if (!page) {
    problems.push(`missing ${PAGE}`);
    return problems;
  }

  const code = stripComments(page);

  if (/to=["']\/lists\/safety\/internal-fine-reasons["']/.test(code)) {
    problems.push(
      `${PAGE}: still links out to /lists/safety/internal-fine-reasons — create must be inline in the picker (Law §4 / SAF-F24).`
    );
  }

  if (!/createKind=["']internal_fine_reason["']/.test(code) || !/ReferenceSelect/.test(code)) {
    problems.push(
      `${PAGE}: reason picker must use ReferenceSelect createKind=internal_fine_reason (CatalogQuickCreateDrawer first row).`
    );
  }

  if (/ADD_REASON_SENTINEL|internal-fine-reason-create-modal/.test(code)) {
    problems.push(`${PAGE}: must not keep SelectCombobox sentinel / external Modal dual path`);
  }

  if (/window\.open\(/.test(code)) {
    problems.push(`${PAGE}: reason create must not window.open to Lists — inline CatalogQuickCreateDrawer only (SAF-F24).`);
  }

  if (!/onOptionCreated=\{/.test(code)) {
    problems.push(`${PAGE}: ReferenceSelect must wire onOptionCreated to refresh the reason catalog after inline create.`);
  }

  if (!/invalidateQueries/.test(code) || !/internal-fine-reasons/.test(code)) {
    problems.push(`${PAGE}: onOptionCreated must invalidate the internal-fine-reasons picker query.`);
  }

  if (!/default_amount/.test(code)) {
    problems.push(`${PAGE}: selecting a reason must prefill amount from catalog default_amount.`);
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else {
    if (!/internal_fine_reason:\s*\{/.test(registry)) {
      problems.push(`${REGISTRY}: missing internal_fine_reason entry`);
    }
    if (!/writeTable:\s*"catalogs\.internal_fine_reasons"/.test(registry)) {
      problems.push(`${REGISTRY}: writeTable must be catalogs.internal_fine_reasons`);
    }
    if (!/\/api\/v1\/catalogs\/safety\/internal-fine-reasons/.test(registry)) {
      problems.push(`${REGISTRY}: must POST safety/internal-fine-reasons`);
    }
  }

  if (!routes) problems.push(`missing ${ROUTES}`);
  else if (
    !/INSERT INTO catalogs\.internal_fine_reasons/.test(routes) ||
    !/FROM catalogs\.internal_fine_reasons/.test(routes)
  ) {
    problems.push(`${ROUTES}: must SELECT+INSERT catalogs.internal_fine_reasons (VERIFY-2 cl.5)`);
  }

  return problems;
}

if (SELFTEST) {
  const live = readRel(PAGE) ?? "";
  const failures = [];

  const expectCaught = (name, mutated, needle) => {
    if (mutated === live) {
      failures.push(`${name}: inert mutation`);
      return;
    }
    const inlineCode = stripComments(mutated);
    const inlineProblems = [];
    if (/to=["']\/lists\/safety\/internal-fine-reasons["']/.test(inlineCode)) {
      inlineProblems.push("links out to /lists/safety/internal-fine-reasons");
    }
    if (!/createKind=["']internal_fine_reason["']/.test(inlineCode) || !/ReferenceSelect/.test(inlineCode)) {
      inlineProblems.push("ReferenceSelect createKind=internal_fine_reason");
    }
    if (!inlineProblems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${inlineProblems.join(" | ") || "none"})`);
    }
  };

  expectCaught(
    "external-link-returns",
    live.replace(
      /(<ReferenceSelect[\s\S]*?\/>)/,
      '$1\n            <Link to="/lists/safety/internal-fine-reasons">Add reason in catalog</Link>'
    ),
    "links out to /lists/safety/internal-fine-reasons"
  );

  expectCaught(
    "no-createKind",
    live.replace(/createKind=["']internal_fine_reason["']/, 'createKind="vendor"'),
    "createKind=internal_fine_reason"
  );

  expectCaught(
    "selectCombobox-regression",
    live.replace(/<ReferenceSelect[\s\S]*?\/>/, '<SelectCombobox value={form.reason_uuid} onChange={() => {}} />'),
    "ReferenceSelect createKind=internal_fine_reason"
  );

  const liveProblems = collectSafetyF24Problems();
  if (liveProblems.length) failures.push(`live source FAILS: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — planted SAF-F24 defects caught, live source clean`);
  process.exit(0);
}

const problems = collectSafetyF24Problems();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — Internal Fines reason picker uses ReferenceSelect first-row inline create (SAF-F24)`);
