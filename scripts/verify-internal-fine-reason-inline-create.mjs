#!/usr/bin/env node
/**
 * GUARD: the internal-fine reason picker has INLINE create (Law §4), not an external Lists link (SAF-F24).
 *
 * WHY THIS EXISTS (2026-07-23 audit)
 * InternalFinesPage's reason create affordance was a <Link to="/lists/safety/internal-fine-reasons">
 * OUTSIDE the dropdown — Law §4 requires "+ Add new …" as the first row INSIDE the dropdown.
 *
 * 2026-07-30 LST-PICKER-01: the SelectCombobox sentinel + external Modal path was replaced by
 * ReferenceSelect createKind=internal_fine_reason (CatalogQuickCreateDrawer). Same Law §4 contract:
 * inline create, same-table write, auto-select — without a page-local Modal dual path.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/safety/InternalFinesPage.tsx";
const LABEL = "verify-internal-fine-reason-inline-create";
const SELFTEST = process.argv.includes("--selftest");

const read = () => fs.readFileSync(path.join(ROOT, PAGE), "utf8");
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertInlineReasonCreate(source) {
  const code = stripComments(source ?? read());
  const problems = [];

  if (/to=["']\/lists\/safety\/internal-fine-reasons["']/.test(code)) {
    problems.push(
      `${PAGE}: still links out to /lists/safety/internal-fine-reasons — the create must be inline in the picker (Law §4).`
    );
  }

  const usesReferenceSelect =
    /createKind=["']internal_fine_reason["']/.test(code) && /ReferenceSelect/.test(code);
  const usesLegacySentinel =
    /ADD_REASON_SENTINEL/.test(code) &&
    /setReasonModalOpen\(true\)/.test(code) &&
    /createInternalFineReason\(/.test(code) &&
    /reason_uuid:\s*String\(created\.id\)/.test(code);

  if (!usesReferenceSelect && !usesLegacySentinel) {
    problems.push(
      `${PAGE}: reason picker must use ReferenceSelect createKind=internal_fine_reason (or legacy sentinel+modal createInternalFineReason with auto-select).`
    );
  }

  return problems;
}

if (SELFTEST) {
  const live = read();
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (mutated === live) {
      failures.push(`${name}: inert mutation`);
      return;
    }
    const problems = assertInlineReasonCreate(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
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
    "no-inline-create",
    live.replace(/createKind=["']internal_fine_reason["']/, 'createKind="vendor"').replace(/ReferenceSelect/g, "SelectCombobox"),
    "reason picker must use ReferenceSelect"
  );

  const liveProblems = assertInlineReasonCreate(live);
  if (liveProblems.length) failures.push(`live source FAILS: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — planted defects caught, live source clean`);
  process.exit(0);
}

const problems = assertInlineReasonCreate();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — reason create is inline in the picker (ReferenceSelect), no external link`);
