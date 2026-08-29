#!/usr/bin/env node
/**
 * SAF-B24 — no safety surface may hand-roll its own drawer.
 *
 * The defect: F25's acceptance is "no bespoke drawer remains", and three survived it —
 * CompanyViolationDetailDrawer, IntegrityAlertDetailDrawer and AnomalyDetailDrawer were all bare
 * <aside> elements with their own backdrop, z-index, width, escape handling and close button, each
 * carrying live mutations. They survived because the existing guard (verify-safety-money-chrome,
 * step 1345) PINS THREE FILENAMES. A guard that names its subjects can only ever protect those
 * subjects; the fourth, fifth and sixth copy are invisible to it by construction.
 *
 * So this guard names none. It DISCOVERS every drawer component under the safety surfaces and
 * requires each to render the shared ParityDrawer rather than a hand-rolled dialog. A drawer added
 * tomorrow is in scope the moment it lands, which is the only version of this rule that holds.
 *
 * Why it matters beyond tidiness: each bespoke copy re-implemented focus trapping, escape-to-close
 * and z-order. Every fix to drawer behaviour had to be made N times, and the copies drifted — which
 * is how a dialog ends up un-dismissable or stacked under its own backdrop for keyboard users.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

/** Safety surfaces. Discovery is by directory, not by filename list. */
const SAFETY_DIRS = [
  "apps/frontend/src/pages/safety",
  "apps/frontend/src/components/safety",
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full, out);
    } else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/**
 * A hand-rolled drawer: an <aside> acting as a modal dialog pinned to the viewport edge. Matching on
 * this shape rather than on filenames is the whole point — the defect is the SHAPE.
 */
function isBespokeDrawer(src) {
  return /<aside\b/.test(src) && /role="dialog"/.test(src) && /fixed right-0/.test(src);
}

export function run() {
  const files = SAFETY_DIRS.flatMap((d) => walk(join(ROOT, d)));
  // A "drawer" is anything that renders a modal dialog surface, however it is named.
  const drawers = [];
  const offenders = [];

  for (const f of files) {
    const raw = readFileSync(f, "utf8");
    const src = stripComments(raw);
    const rendersDrawer = /ParityDrawer/.test(src) || isBespokeDrawer(src);
    if (!rendersDrawer) continue;
    const rel = relative(ROOT, f);
    drawers.push(rel);
    if (isBespokeDrawer(src)) offenders.push(rel);
  }

  if (drawers.length === 0) {
    return {
      ok: false,
      drawers: [],
      offenders: [],
      message:
        "FAIL: discovered ZERO safety drawers — the guard lost its subject and would pass vacuously. " +
        "Fix the discovery pattern rather than ignoring this.",
    };
  }

  const ok = offenders.length === 0;
  return {
    ok,
    drawers,
    offenders,
    message: ok
      ? `PASS: ${drawers.length} of ${drawers.length} safety drawers use the shared ParityDrawer; ` +
        `no hand-rolled <aside role="dialog"> remains.`
      : `FAIL: ${offenders.length} of ${drawers.length} safety drawers are hand-rolled dialogs instead of ` +
        `ParityDrawer: ${offenders.join(", ")}. Each re-implements backdrop, z-index, width, escape and ` +
        `focus behaviour, so every drawer fix must be made again here and this copy will drift.`,
  };
}

/**
 * Reverts a real migrated drawer back to a bespoke <aside> in the real file and requires the catch.
 * A fixture would only prove the regex compiles; this proves the guard still sees the repository.
 */
function selftest() {
  const { writeFileSync } = fs;
  const target = join(ROOT, "apps/frontend/src/pages/safety/components/CompanyViolationDetailDrawer.tsx");
  const original = readFileSync(target, "utf8");

  const baseline = run();
  if (!baseline.ok) {
    console.error(`SELFTEST FAIL: repository is already red before any mutation.\n${baseline.message}`);
    process.exit(1);
  }

  // RE-ANCHOR (found stale 2026-08-29): CompanyViolationDetailDrawer.tsx's <ParityDrawer> tag was
  // since reformatted onto multiple lines with more props (confirmDiscardOnClose, isDirty,
  // onRegisterAttemptClose, footer) and its onClose handler renamed to handleClose — the exact
  // single-line literal never matched again, so the revert was a silent no-op. Match the opening
  // <ParityDrawer through its first `>` instead of the exact prop list/order/name.
  const reverted = original.replace(
    /<ParityDrawer\b[\s\S]*?>/,
    '<aside role="dialog" aria-modal="true" className="fixed right-0 top-0 z-50">'
  );
  if (reverted === original) {
    console.error("SELFTEST FAIL: could not revert the migrated drawer — the mutation would be a no-op.");
    process.exit(1);
  }

  let caught;
  try {
    writeFileSync(target, reverted, "utf8");
    caught = run();
  } finally {
    writeFileSync(target, original, "utf8");
  }

  if (caught.ok || !caught.offenders.some((o) => o.endsWith("CompanyViolationDetailDrawer.tsx"))) {
    console.error(`SELFTEST FAIL: a reverted bespoke drawer was NOT caught.\n${caught.message}`);
    process.exit(1);
  }

  const after = run();
  if (!after.ok) {
    console.error(`SELFTEST FAIL: restore did not return the repository to green.\n${after.message}`);
    process.exit(1);
  }
  console.log(`SELFTEST PASS: reverting a drawer to a hand-rolled <aside> is detected, and restore is green.`);
}

import * as fs from "node:fs";

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const result = run();
  console.log(result.message);
  if (result.drawers) console.log(`  safety drawers: ${result.drawers.length}`);
  if (!result.ok) process.exit(1);
}
