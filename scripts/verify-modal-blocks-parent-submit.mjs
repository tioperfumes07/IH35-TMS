#!/usr/bin/env node
/**
 * FAIL-B1 — a nested "+ Create" must never submit the wizard behind it.
 *
 * `components/Modal.tsx` renders through `createPortal`, so a create modal's DOM sits outside the Book Load
 * wizard's `<form>`. React, however, propagates events through the REACT tree, not the DOM tree — so a
 * submit inside the modal still reaches the outer `<form onSubmit>` that is its React ancestor, and opening
 * a create drawer could BOOK THE LOAD. That is a real write, not a cosmetic glitch.
 *
 * Individual forms patched this one at a time (CreateDriverModal, the parity drawers), but a census found
 * five that had not — W8BenModal, AddTrainingModal, QuickAssignModal, CreateTrailerModal, VendorCreateModal
 * — and the last two are reachable directly from Book Load. Per-form guards are whack-a-mole and every NEW
 * create form starts unguarded, so the stop lives on the modal panel itself.
 *
 *   node scripts/verify-modal-blocks-parent-submit.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-modal-blocks-parent-submit";
const MODAL = "apps/frontend/src/components/Modal.tsx";

function assert(files) {
  const src = files[MODAL] ?? "";
  const problems = [];
  if (!/createPortal/.test(src)) {
    problems.push(`${MODAL}: expected this modal to render through createPortal — the guard below assumes it`);
  }
  if (!/onSubmit=\{\(event\) => event\.stopPropagation\(\)\}/.test(src)) {
    problems.push(`${MODAL}: the modal panel must stop submit propagation, or a nested "+ Create" submits the parent wizard (React bubbles across portals)`);
  }
  return problems;
}

const files = Object.fromEntries([MODAL].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]));

if (SELFTEST) {
  const checks = [
    ["submit guard removed", { [MODAL]: files[MODAL].replace(/onSubmit=\{\(event\) => event\.stopPropagation\(\)\}/, "") }],
  ];
  for (const [name, planted] of checks) {
    if (!assert(planted).length) {
      console.error(`${LABEL} SELFTEST FAIL — planted "${name}" was not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} planted breaks caught`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — a modal's internal submit cannot reach the form behind it`);
process.exit(0);
