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
//   2. The board-view toolbar is a role="group" segmented control with no button repeated in it, and
//      the owner-named views (Kanban | List | Round Trips | Trip Pairing — DISPATCH item #2) present.
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
    // 443.99 (2026-10-12) — toolbar-duplicate check re-anchored.
    //   old rule: "Trip Pairing" (id "trip-pairing") must NOT appear in the board-view toolbar.
    //   new rule: every board-view id appears in the toolbar exactly ONCE (no duplicated button), and the
    //             owner-named views Kanban / List / Round Trips / Trip Pairing are each present.
    //   why: the owner ruled (DISPATCH item #2, 2026-09-04) that Trip Pairing IS a peer button in this
    //        one board-view row while its queues sub-nav entry is retained — pinned by
    //        verify-dispatch-trip-pairing-in-board-view-row.mjs. #20614 removed it as a "duplicate"; it
    //        was restored with the correction recorded in Dispatch.tsx, so this guard and that one could
    //        never both pass. L.4b's actual defect ("4 duplicate tabs") is a button repeated inside the
    //        toolbar, which this still fails on.
    const ids = [...toolbarArray.matchAll(/\bid:\s*"([^"]+)"/g)].map((m) => m[1]);
    const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    if (dupes.length) {
      problems.push(`${FILE}: board-view toolbar repeats a button: ${dupes.join(", ")}`);
    }
    for (const id of ["kanban", "list", "round-trips", "trip-pairing"]) {
      if (!ids.includes(id)) problems.push(`${FILE}: board-view toolbar is missing the owner-named "${id}" view`);
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
    // filled button), missing test-ids, tablist role, and a button repeated in the toolbar array.
    fs.writeFileSync(
      path.join(tmpRoot, FILE),
      `
      <Button variant={view === "overview" ? "primary" : "secondary"} />
      <div data-testid="dispatch-board-view-row" role="tablist">
        {[
          { id: "kanban", label: "Kanban" },
          { id: "list", label: "List" },
          { id: "round-trips", label: "Round Trips" },
          { id: "trip-pairing", label: "Trip Pairing" },
          { id: "kanban", label: "Kanban" },
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
  console.log(`${LABEL} OK — Book Load is the only filled button; board-view toolbar is a role="group" with each owner-named view exactly once`);
}
