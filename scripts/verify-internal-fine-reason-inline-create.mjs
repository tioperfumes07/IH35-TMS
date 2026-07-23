#!/usr/bin/env node
/**
 * GUARD: the internal-fine reason picker has an INLINE "+ Add new" (Law §4), not an external link (SAF-F24).
 *
 * WHY THIS EXISTS (2026-07-23 audit)
 * InternalFinesPage's reason create affordance was a <Link to="/lists/safety/internal-fine-reasons">
 * "Add reason in catalog" OUTSIDE the dropdown — Law §4 requires "+ Add new …" as the first row INSIDE
 * the dropdown, opening a mini-create without leaving the page. The old link navigated away, losing the
 * half-filled fine.
 *
 * Fix contract: an inline "+ Add new reason" option inside the picker → a local create modal that posts
 * to the reasons catalog and auto-selects the new reason; the external Link is gone.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/safety/InternalFinesPage.tsx";
const LABEL = "verify-internal-fine-reason-inline-create";
const SELFTEST = process.argv.includes("--selftest");

const read = () => fs.readFileSync(path.join(ROOT, PAGE), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertInlineReasonCreate(source) {
  const code = stripComments(source ?? read());
  const problems = [];

  // No external Link to the reasons list page (that is the anti-pattern).
  if (/to="\/lists\/safety\/internal-fine-reasons"/.test(code)) {
    problems.push(`${PAGE}: still links out to /lists/safety/internal-fine-reasons — the create must be inline in the picker (Law §4).`);
  }
  // Inline "+ Add new" option inside the picker.
  if (!/\+ Add new reason/.test(code)) {
    problems.push(`${PAGE}: no inline "+ Add new reason" option inside the reason dropdown.`);
  }
  // The option is wired to open the create modal (a sentinel handled in onChange).
  if (!/ADD_REASON_SENTINEL/.test(code) || !/setReasonModalOpen\(true\)/.test(code)) {
    problems.push(`${PAGE}: the "+ Add new reason" option does not open a create modal (sentinel not handled).`);
  }
  // The modal actually creates via the catalog endpoint and auto-selects the new reason.
  if (!/createInternalFineReason\(/.test(code)) {
    problems.push(`${PAGE}: the reason modal does not call createInternalFineReason — it cannot create a reason.`);
  }
  if (!/reason_uuid:\s*String\(created\.id\)/.test(code)) {
    problems.push(`${PAGE}: after creating a reason the new one is not auto-selected (reason_uuid = created.id).`);
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

  // 1. the external link comes back.
  expectCaught(
    "external-link-returns",
    live.replace('<option value={ADD_REASON_SENTINEL}>+ Add new reason…</option>', '<Link to="/lists/safety/internal-fine-reasons">Add reason in catalog</Link>'),
    "links out to /lists/safety/internal-fine-reasons"
  );
  // 2. the inline option is removed.
  expectCaught("no-inline-option", live.replace(/<option value=\{ADD_REASON_SENTINEL\}>\+ Add new reason…<\/option>/, ""), 'no inline "+ Add new reason"');
  // 3. auto-select is dropped.
  expectCaught("no-autoselect", live.replace(/reason_uuid: String\(created\.id\)/, "reason_uuid: v.reason_uuid"), "not auto-selected");

  const liveProblems = assertInlineReasonCreate(live);
  if (liveProblems.length) failures.push(`live source FAILS: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 3 planted defects caught, live source clean`);
  process.exit(0);
}

const problems = assertInlineReasonCreate();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — reason create is inline in the picker, auto-selects, no external link`);
