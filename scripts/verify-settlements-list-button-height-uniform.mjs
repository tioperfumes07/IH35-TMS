#!/usr/bin/env node
// SET-07 (owner LOCKED MANDATE 2026-09-09) — the Settlements list surface measured SEVEN distinct
// clickable heights (17–43px). The two heights OWNED by the settlements-list source (not shared
// ParityTable, not filter-law h-9, not the compact KPI tiles) were off the 28px clickable-box scale
// (SQUARE-EDGES / GLOBAL-TYPE-SIZE-BASELINE: clickable boxes 28px, 2px radius, 12px font):
//
//   1. SettlementsToursRegister — the "Pre-Settlement (open)" / "Settlement (closed)" tour pills
//      carried an inline `style={{ height: 22 }}` override that beat the 28px `.ldt-btn` token.
//   2. SettlementsTable — the row "Open →" action was a bare underline text button (~17px), not a
//      28px-tall click target.
//
// This guard pins both to the 28px scale:
//   A. the tours-pills block uses the `.ldt-btn` token and carries NO inline `style={{ height ...`.
//   B. the "Open →" row action is an `h-7` (28px) click target.
//
// Shared ParityTable pager/gear (verify-ui-control-law lane), the h-9 filter selects (filter-law),
// and the compact KPI tiles are governed by their own locked specs and are intentionally out of scope.
//
// node scripts/verify-settlements-list-button-height-uniform.mjs
// node scripts/verify-settlements-list-button-height-uniform.mjs --selftest
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { maskComments } from "./lib/mask-comments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlements-list-button-height-uniform";
const TOURS = "apps/frontend/src/pages/driver-finance/SettlementsToursRegister.tsx";
const TABLE = "apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx";

const PILLS_START = 'data-testid="settlements-tours-pills"';
const PILLS_END = "<ParityTable";
const OPEN_ACTION = "Open →";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];

  // A — tour pills at 28px via .ldt-btn, no inline height override.
  const toursRaw = readRel(root, TOURS);
  if (!toursRaw) {
    problems.push(`missing ${TOURS}`);
  } else {
    const masked = maskComments(toursRaw);
    const startIdx = masked.indexOf(PILLS_START);
    const endIdx = masked.indexOf(PILLS_END, startIdx >= 0 ? startIdx : 0);
    if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
      problems.push(`${TOURS}: could not locate the tours-pills block (markers moved) — update this guard's markers`);
    } else {
      const block = masked.slice(startIdx, endIdx);
      if (!/\bldt-btn\b/.test(block)) {
        problems.push(`${TOURS}: tour pills must use the 28px .ldt-btn token`);
      }
      if (/style=\{\{\s*height/.test(block)) {
        problems.push(`${TOURS}: tour pills must not carry an inline style height override — it breaks the 28px .ldt-btn scale`);
      }
    }
  }

  // B — the "Open →" row action is a 28px (h-7) click target.
  const tableRaw = readRel(root, TABLE);
  if (!tableRaw) {
    problems.push(`missing ${TABLE}`);
  } else {
    const masked = maskComments(tableRaw);
    const openIdx = masked.indexOf(OPEN_ACTION);
    if (openIdx < 0) {
      problems.push(`${TABLE}: could not locate the "Open →" row action (marker moved) — update this guard's markers`);
    } else {
      const window = masked.slice(Math.max(0, openIdx - 260), openIdx);
      if (!/\bh-7\b/.test(window)) {
        problems.push(`${TABLE}: the "Open →" row action must be an h-7 (28px) click target, not a bare text button`);
      }
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

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "settlements-btn-height-guard-"));
  try {
    // Plant the exact pre-fix defect shape in BOTH files.
    const toursDir = path.join(tmpRoot, path.dirname(TOURS));
    fs.mkdirSync(toursDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, TOURS),
      `<div ${PILLS_START}><button className="ldt-btn p" style={{ height: 22 }}>x</button></div>\n${PILLS_END}\n`
    );

    const tableDir = path.join(tmpRoot, path.dirname(TABLE));
    fs.mkdirSync(tableDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, TABLE),
      `<button type="button" className="text-slate-700 underline">${OPEN_ACTION}</button>\n`
    );

    const planted = collectProblems(tmpRoot);
    if (planted.length !== 2) {
      console.error(
        `${LABEL} SELFTEST FAIL: expected 2 problems on the planted pre-fix stubs, got ${planted.length}: ${JSON.stringify(planted)}`
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
  console.log(`${LABEL} OK — settlements list tour pills + row-open action on the 28px clickable scale`);
}
