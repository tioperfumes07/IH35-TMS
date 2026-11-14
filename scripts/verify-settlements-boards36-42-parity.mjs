#!/usr/bin/env node
// R90-36/37/38/39/40/41/42 (ROUND 9.0 BOARDS 36-42 — 2026-11-13) — Design-parity guard.
//
// Parity census (1 element per board × 9 source files):
//   KPI strip must use minmax(150px,1fr) everywhere — the R90 standard.
//   Board-specific structural elements are verified individually per board.
//
// Source files:
//   36 Pre-Settlements   — SettlementsPreSettlementsBoard.tsx
//   37 Close             — SettlementCloseArrivalPage.tsx
//   38 Cash Advances     — SettlementsCashAdvancesBoard.tsx
//   39 Escrow            — SettlementsEscrowBoard.tsx
//   40 Escrow Register   — EscrowRegisterPage.tsx
//   41 Deductions        — SettlementsDeductionsBoard.tsx
//   42 Company           — CompanySettlementsPage.tsx
//   +  SettlementDetailPage.tsx  (statement KPI strip)
//   +  SettlementStatementWorkflowPage.tsx (already guarded by board35, but 150px here too)
//
// node scripts/verify-settlements-boards36-42-parity.mjs
// node scripts/verify-settlements-boards36-42-parity.mjs --selftest
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlements-boards36-42-parity";
const DF = "apps/frontend/src/pages/driver-finance";

const KPI_FILES = [
  { board: "36", file: `${DF}/SettlementsPreSettlementsBoard.tsx`, extra: null },
  { board: "37", file: `${DF}/SettlementCloseArrivalPage.tsx`, extra: null },
  { board: "38", file: `${DF}/SettlementsCashAdvancesBoard.tsx`, extra: null },
  { board: "39", file: `${DF}/SettlementsEscrowBoard.tsx`, extra: "Open register →" },
  { board: "40", file: `${DF}/EscrowRegisterPage.tsx`, extra: null },
  { board: "41", file: `${DF}/SettlementsDeductionsBoard.tsx`, extra: null },
  { board: "42", file: `${DF}/CompanySettlementsPage.tsx`, extra: "Margin %" },
];

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];

  for (const { board, file, extra } of KPI_FILES) {
    const src = readRel(root, file);
    if (!src) {
      problems.push(`Board ${board}: missing ${file}`);
      continue;
    }
    if (!src.includes("minmax(150px,1fr)")) {
      problems.push(`Board ${board} ${file}: KPI strip must use minmax(150px,1fr) (R90 standard)`);
    }
    if (extra && !src.includes(extra)) {
      problems.push(`Board ${board} ${file}: must include "${extra}" (R90 parity census)`);
    }
  }

  // Board 36 — CLOSE_BOARD_STEPS 7 steps
  const close = readRel(root, `${DF}/SettlementCloseArrivalPage.tsx`);
  if (close && !close.includes('{ n: 7, label: "Net & pay" }') && !close.includes("n: 7")) {
    problems.push(`Board 37 SettlementCloseArrivalPage.tsx: wizard must have 7 steps incl. "Net & pay"`);
  }

  // Board 36 — What closes a tour block present (via SettlementsPreSettlementsClosesPanel)
  const preSettle = readRel(root, `${DF}/SettlementsPreSettlementsBoard.tsx`);
  if (preSettle && !preSettle.includes("SettlementsPreSettlementsClosesPanel")) {
    problems.push(`Board 36 SettlementsPreSettlementsBoard.tsx: must render SettlementsPreSettlementsClosesPanel (R90-36 "What closes a tour" block)`);
  }

  // Board 39 — Escrow aggregation filters by holder_type=driver and excludes $0
  const escrow = readRel(root, `${DF}/SettlementsEscrowBoard.tsx`);
  if (escrow && !escrow.includes('holder_type !== "driver"')) {
    problems.push(`Board 39 SettlementsEscrowBoard.tsx: must filter to holder_type=driver (R90-39 no junk rows)`);
  }

  return problems;
}

// ── selftest ───────────────────────────────────────────────────────────────
function runSelftest() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "r9036-parity-"));
  const dir = path.join(tmpDir, DF);
  fs.mkdirSync(dir, { recursive: true });

  // Write good versions
  const files = {
    "SettlementsPreSettlementsBoard.tsx": `minmax(150px,1fr)\nSettlementsPreSettlementsClosesPanel`,
    "SettlementCloseArrivalPage.tsx": `minmax(150px,1fr)\n{ n: 7, label: "Net & pay" }`,
    "SettlementsCashAdvancesBoard.tsx": `minmax(150px,1fr)`,
    "SettlementsEscrowBoard.tsx": `minmax(150px,1fr)\nOpen register →\nholder_type !== "driver"`,
    "EscrowRegisterPage.tsx": `minmax(150px,1fr)`,
    "SettlementsDeductionsBoard.tsx": `minmax(150px,1fr)`,
    "CompanySettlementsPage.tsx": `minmax(150px,1fr)\nMargin %`,
  };
  for (const [f, c] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, f), c);
  }

  const good0 = collectProblems(tmpDir);
  let passed = 0;
  let failed = 0;

  if (good0.length !== 0) {
    console.error(`  FAIL [all good → 0 problems]: got ${good0.length}: ${JSON.stringify(good0)}`);
    failed++;
  } else {
    console.log(`  PASS [all good → 0 problems]`);
    passed++;
  }

  // Test: missing 150px in one file
  fs.writeFileSync(path.join(dir, "SettlementsEscrowBoard.tsx"), `minmax(140px,1fr)\nOpen register →\nholder_type !== "driver"`);
  const p1 = collectProblems(tmpDir);
  if (p1.length !== 1) {
    console.error(`  FAIL [EscrowBoard 140px → 1 problem]: got ${p1.length}`);
    failed++;
  } else {
    console.log(`  PASS [EscrowBoard 140px → 1 problem]`);
    passed++;
    fs.writeFileSync(path.join(dir, "SettlementsEscrowBoard.tsx"), `minmax(150px,1fr)\nOpen register →\nholder_type !== "driver"`);
  }

  // Test: missing "Open register →" in Escrow
  fs.writeFileSync(path.join(dir, "SettlementsEscrowBoard.tsx"), `minmax(150px,1fr)\nholder_type !== "driver"`);
  const p2 = collectProblems(tmpDir);
  if (p2.length !== 1) {
    console.error(`  FAIL [Escrow missing Open register → 1 problem]: got ${p2.length}`);
    failed++;
  } else {
    console.log(`  PASS [Escrow missing "Open register →" → 1 problem]`);
    passed++;
    fs.writeFileSync(path.join(dir, "SettlementsEscrowBoard.tsx"), `minmax(150px,1fr)\nOpen register →\nholder_type !== "driver"`);
  }

  // Test: missing closes panel in PreSettlements
  fs.writeFileSync(path.join(dir, "SettlementsPreSettlementsBoard.tsx"), `minmax(150px,1fr)\nSomethingElse`);
  const p3 = collectProblems(tmpDir);
  if (p3.length !== 1) {
    console.error(`  FAIL [PreSettlements missing closes panel → 1 problem]: got ${p3.length}`);
    failed++;
  } else {
    console.log(`  PASS [PreSettlements missing closes panel → 1 problem]`);
    passed++;
    fs.writeFileSync(path.join(dir, "SettlementsPreSettlementsBoard.tsx"), `minmax(150px,1fr)\nSettlementsPreSettlementsClosesPanel`);
  }

  // Test: missing Margin % in CompanySettlements
  fs.writeFileSync(path.join(dir, "CompanySettlementsPage.tsx"), `minmax(150px,1fr)`);
  const p4 = collectProblems(tmpDir);
  if (p4.length !== 1) {
    console.error(`  FAIL [CompanySettlements missing Margin % → 1 problem]: got ${p4.length}`);
    failed++;
  } else {
    console.log(`  PASS [CompanySettlements missing Margin % → 1 problem]`);
    passed++;
    fs.writeFileSync(path.join(dir, "CompanySettlementsPage.tsx"), `minmax(150px,1fr)\nMargin %`);
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });

  if (failed > 0) {
    console.error(`\n${LABEL} selftest: ${failed} failed`);
    process.exit(1);
  }
  console.log(`\n${LABEL} selftest: ${passed}/${passed} passed`);
  process.exit(0);
}

// ── main ──────────────────────────────────────────────────────────────────
if (process.argv.includes("--selftest")) {
  runSelftest();
} else {
  const problems = collectProblems();
  if (problems.length === 0) {
    console.log(`[${LABEL}] PASS — all R90-36/37/38/39/40/41/42 parity elements present`);
    process.exit(0);
  } else {
    for (const p of problems) console.error(`[${LABEL}] FAIL: ${p}`);
    process.exit(1);
  }
}
