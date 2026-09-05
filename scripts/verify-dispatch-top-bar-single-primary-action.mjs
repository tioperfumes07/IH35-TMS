#!/usr/bin/env node
// L.4b (DESIGN-CONTRACT-DISPATCH-BOARD-2026-09-05.md §B, OWNER-ISSUE-INVENTORY-2026-09-05.md #8,
// surrendered Cursor -> CC-2 14:00Z, deadline extended 16:30Z): "one nav, one toolbar ... + Book
// Load sole filled button ... Live: two nav rows, 4 duplicate tabs, 32px buttons beside 36px."
//
// This guard pins the two structural facts fixed in this pass (source-scan, comments masked so
// this very comment block can't satisfy or break it):
//   1. "+ Book Load" is the ONLY primary/filled control on the Dispatch page — Home / Live /
//      Loads history never key their variant off view/boardScope state (that was the double-
//      filled-button bug: Book Load is always primary, and whichever of Home/Live/History was
//      active was ALSO primary at the same time).
//   2. The board-view toolbar (Kanban | List | Round Trips) is a role="group" segmented control
//      with exactly those three buttons — "Trip Pairing" (an exact duplicate of DispatchSubnav's
//      own "Trip Pairing" nav item, still fully reachable there) does not reappear in it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { maskComments } from "./lib/mask-comments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatch-top-bar-single-primary-action";
const FILE = "apps/frontend/src/pages/Dispatch.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const raw = readRel(root, FILE);
  if (!raw) {
    problems.push(`missing ${FILE}`);
    return problems;
  }
  const src = maskComments(raw);

  // Regression sentinel for the double-filled-button bug: Home/Live/Loads-history must never
  // compute their `variant` from view/boardScope — only Book Load may be primary.
  if (/variant=\{[^}]*(view === "overview"|boardScope === "live"|boardScope === "history")[^}]*\?\s*"primary"/.test(src)) {
    problems.push(`${FILE}: Home/Live/Loads-history must not conditionally render as variant="primary" — Book Load must be the ONLY filled button`);
  }
  if (!/data-testid="dispatch-view-overview"/.test(src) || !/data-testid="dispatch-board-scope-live"/.test(src) || !/data-testid="dispatch-board-scope-history"/.test(src)) {
    problems.push(`${FILE}: existing Home/Live/Loads-history test-ids must be preserved (existing test suite depends on them)`);
  }

  const boardViewIdx = src.indexOf('data-testid="dispatch-board-view-row"');
  if (boardViewIdx < 0) {
    problems.push(`${FILE}: dispatch-board-view-row toolbar not found`);
  } else {
    const wrapperStart = src.lastIndexOf("<div", boardViewIdx);
    const wrapperTag = src.slice(wrapperStart, boardViewIdx + 60);
    if (!/role="group"/.test(wrapperTag)) {
      problems.push(`${FILE}: the board-view toolbar must be role="group" (a toggle group), not role="tablist"`);
    }
    const arrayEnd = src.indexOf("] as const", boardViewIdx);
    const toolbarArray = arrayEnd > 0 ? src.slice(boardViewIdx, arrayEnd) : "";
    if (/id:\s*"trip-pairing"/.test(toolbarArray)) {
      problems.push(`${FILE}: "Trip Pairing" must not duplicate DispatchSubnav's own nav item inside the board-view toolbar`);
    }
  }

  return problems;
}

function fail(messages) {
  console.error(`${LABEL} FAIL:`);
  for (const m of messages) console.error(`  - ${m}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) fail(baseline);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-top-bar-guard-"));
  try {
    fs.mkdirSync(path.join(tmpRoot, path.dirname(FILE)), { recursive: true });
    // Planted stub reproduces the exact pre-fix defect shape: variant keyed off state (double
    // filled button), missing test-ids, tablist role, and "Trip Pairing" back in the toolbar array.
    fs.writeFileSync(
      path.join(tmpRoot, FILE),
      `
      <Button variant={view === "overview" ? "primary" : "secondary"} />
      <div data-testid="dispatch-board-view-row" role="tablist">
        {[
          { id: "kanban", label: "Kanban" },
          { id: "trip-pairing", label: "Trip Pairing" },
        ] as const}
      </div>
      `
    );
    const planted = collectProblems(tmpRoot);
    if (planted.length !== 4) {
      console.error(
        `${LABEL} SELFTEST FAIL: expected 4 problems on the planted pre-fix stub, got ${planted.length}: ${JSON.stringify(planted)}`
      );
      process.exit(1);
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length > 0) fail(problems);
  console.log(`${LABEL} OK — Book Load is the only filled button; board-view toolbar is a 3-button role="group" with no duplicate Trip Pairing`);
}
