#!/usr/bin/env node
/**
 * GUARD — ORPHANED FORM OWNERS ("a constant wearing a predicate's shape", root cause edition).
 *
 * THE CLASS. Four defects in one day were the same shape: a live check read state that no mounted
 * writer populated, so the predicate was a constant.
 *   - VendorBillForm validated `account_id`; buildVendorBillLinePayloads never assigned it (ACCT-F93).
 *   - CreateWorkOrderModal validated `line_items`; the editor writes a separate `lines` state (ACCT-F94).
 *   - PreDispatchValidationPanel's override textarea got no onChange prop, so it could not be typed in.
 *
 * THE ROOT CAUSE BEHIND C1, found by sweeping the class rather than the instances:
 * CreateWOSectionCostBreakdown OWNS the `line_items` field array via useFieldArray — and is imported
 * by NOTHING. TwoSectionLineEditor replaced it. An orphaned component that still owns a form field is
 * the dangerous shape: its own useFieldArray/watch pair is internally coherent, so it reads as healthy
 * code, while any LIVE validator trusting that field is silently testing a permanently-empty value.
 *
 * WHAT IT ENFORCES: every component that OWNS form state (useFieldArray) is either imported somewhere,
 * or explicitly annotated `@archived-form-owner` with a `superseded-by:` pointer. A NEW accidental
 * orphan fails; a deliberately archived one passes with its reason on the record (Rule 07 — archive,
 * never delete).
 *
 * Scoped to useFieldArray owners on purpose. A broader "unused component" rule would flag dozens of
 * legitimately-lazy or route-only components and get allowlisted into uselessness; field OWNERS are
 * the subset where being orphaned silently corrupts a validator.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const LABEL = "verify:no-orphaned-form-owners";
const ROOT = "apps/frontend/src";
const ANNOTATION = "@archived-form-owner";

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx") && !p.includes(".test.")) out.push(p);
  }
  return out;
}

export function analyse(files) {
  const problems = [];
  const owners = Object.entries(files).filter(([, src]) => src != null && /useFieldArray\s*\(/.test(src));

  for (const [file, src] of owners) {
    const base = path.basename(file).replace(/\.tsx$/, "");
    const referenced = Object.entries(files).some(
      ([other, otherSrc]) => other !== file && otherSrc != null && new RegExp(`\\b${base}\\b`).test(otherSrc)
    );
    if (referenced) continue;
    if (src.includes(ANNOTATION)) {
      if (!/superseded-by:\s*\S+/.test(src)) {
        problems.push(
          `${file}: carries ${ANNOTATION} but no "superseded-by:" pointer. An archived field owner must ` +
            `say what replaced it, or the next reader cannot tell archived from abandoned.`
        );
      }
      continue;
    }
    problems.push(
      `${file}: owns form state via useFieldArray but is imported NOWHERE. Its fields can never be ` +
        `populated, so any live validator reading them is testing a permanently-empty value — the ` +
        `root cause of ACCT-F94, where a WO could not be created at all. Either mount it, or annotate ` +
        `it ${ANNOTATION} with a superseded-by: pointer (Rule 07 — archive, never delete).`
    );
  }
  return problems;
}

function readAll() {
  const out = {};
  for (const f of walk(ROOT)) out[f] = readFileSync(f, "utf8");
  return out;
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };
  const owner = "const { fields } = useFieldArray({ control, name: 'line_items' });";

  t("an imported owner passes",
    analyse({ "a/Owner.tsx": owner, "a/Parent.tsx": "import { Owner } from './Owner';" }).length === 0);
  // The REAL defect shape.
  t("an unreferenced, unannotated owner FAILS",
    analyse({ "a/Owner.tsx": owner, "a/Other.tsx": "nothing" }).length === 1);
  t("an annotated archived owner passes",
    analyse({ "a/Owner.tsx": `/** @archived-form-owner superseded-by: X.tsx */\n${owner}`, "a/Other.tsx": "x" }).length === 0);
  t("annotated WITHOUT superseded-by FAILS",
    analyse({ "a/Owner.tsx": `/** @archived-form-owner */\n${owner}`, "a/Other.tsx": "x" }).length === 1);
  t("a non-owner component is ignored",
    analyse({ "a/Plain.tsx": "export function Plain(){return null;}", "a/Other.tsx": "x" }).length === 0);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 5 cases (3 pass-shapes, 2 fail-shapes incl. the real orphan)`);
  process.exit(0);
}
const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — every form-field owner is mounted or explicitly archived`);
