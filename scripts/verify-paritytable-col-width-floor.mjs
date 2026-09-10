#!/usr/bin/env node
// BNK-06 (ledger item 26, 2026-09-09) — "Banking Description column collapsed to 0px."
//
// ROOT CAUSE: every manual-resize write path in ParityTable (drag, touch-drag, keyboard nudge)
// already floors a column width at 48px, but the INITIAL LOAD from localStorage
// (`persisted.colWidths`) took the stored value verbatim with no clamp. A width written before the
// floor existed, or corrupted/edited outside the app, loaded and rendered a permanently collapsed
// column with no self-healing -- a 0px (or any sub-floor) column has no visible resize handle to
// grab, so the user could not even fix it by hand. This is a shared-component bug: it can hit any
// table that uses ParityTable with a `storageKey`, not only Banking.
//
// FIX: a named MIN_COL_WIDTH_PX constant (reused by every write path, replacing 4 separate literal
// `48`s) plus a `clampColWidths` helper applied to `persisted.colWidths` at the useState
// initializer, so a stale/corrupted stored width can never load collapsed again.
//
// This guard is STATIC ONLY (no DB, no live check needed -- it is a source-code invariant on a
// single shared frontend component) and asserts, by reading the real file:
//   1. MIN_COL_WIDTH_PX is defined.
//   2. The colWidths useState initializer routes persisted.colWidths through a clamp helper
//      (never the old bare `persisted.colWidths ?? {}` that skipped clamping).
//   3. The clamp helper actually floors every value at MIN_COL_WIDTH_PX (Math.max).
//   4. Every manual-resize write path still shares the same named constant (no literal `48`
//      reintroduced, which would silently re-fork the floor into two numbers that can drift).
import fs from "node:fs";

const REL = "apps/frontend/src/components/parity/ParityTable.tsx";

export function auditSource(src) {
  const failures = [];

  if (!/const MIN_COL_WIDTH_PX\s*=\s*48\s*;/.test(src)) {
    failures.push("MIN_COL_WIDTH_PX constant (=48) is missing");
  }

  const initMatch = src.match(/const \[colWidths, setColWidths\] = useState<[^(]*>\(([\s\S]{0,200}?)\);/);
  if (!initMatch) {
    failures.push("colWidths useState initializer not found");
  } else if (!/clampColWidths\(persisted\.colWidths\)/.test(initMatch[1])) {
    failures.push(
      "colWidths useState initializer does not route persisted.colWidths through clampColWidths -- a stale/corrupted stored width would load unclamped again",
    );
  }

  const clampFn = src.match(/function clampColWidths\([\s\S]{0,600}?\n\}/);
  if (!clampFn) {
    failures.push("clampColWidths helper is missing");
  } else if (!/Math\.max\(MIN_COL_WIDTH_PX,\s*w\)/.test(clampFn[0])) {
    failures.push("clampColWidths does not floor values at MIN_COL_WIDTH_PX");
  }

  // Every manual-resize write path (drag / touch-drag / keyboard nudge) must share the one named
  // constant; a reintroduced literal 48 would fork the floor into two numbers that can silently
  // drift apart.
  const literalFloors = (src.match(/Math\.max\(48,/g) || []).length;
  if (literalFloors > 0) {
    failures.push(`${literalFloors} manual-resize site(s) still use a literal 48 instead of MIN_COL_WIDTH_PX`);
  }
  const namedFloors = (src.match(/Math\.max\(MIN_COL_WIDTH_PX,/g) || []).length;
  if (namedFloors < 3) {
    failures.push(`expected the 3 manual-resize write paths (drag/touch/keyboard) to use MIN_COL_WIDTH_PX, found ${namedFloors}`);
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = `
const MIN_COL_WIDTH_PX = 48;
function clampColWidths(colWidths) {
  if (!colWidths) return {};
  const clamped = {};
  for (const [key, w] of Object.entries(colWidths)) {
    clamped[key] = Math.max(MIN_COL_WIDTH_PX, w);
  }
  return clamped;
}
const [colWidths, setColWidths] = useState<Record<string, number>>(() =>
  clampColWidths(persisted.colWidths),
);
function a() { const w = Math.max(MIN_COL_WIDTH_PX, x); }
function b() { const w = Math.max(MIN_COL_WIDTH_PX, y); }
function c() { const w = Math.max(MIN_COL_WIDTH_PX, z); }
`;
  const pass = auditSource(good);
  if (pass.length) throw new Error("SELFTEST FAIL (should be clean): " + JSON.stringify(pass));

  const noConstant = good.replace("const MIN_COL_WIDTH_PX = 48;", "");
  if (auditSource(noConstant).length === 0) throw new Error("SELFTEST FAIL: missing constant went undetected");

  const noClampOnLoad = good.replace(
    "const [colWidths, setColWidths] = useState<Record<string, number>>(() =>\n  clampColWidths(persisted.colWidths),\n);",
    "const [colWidths, setColWidths] = useState<Record<string, number>>(persisted.colWidths ?? {});",
  );
  if (auditSource(noClampOnLoad).length === 0) throw new Error("SELFTEST FAIL: unclamped load path went undetected");

  const brokenClamp = good.replace("clamped[key] = Math.max(MIN_COL_WIDTH_PX, w);", "clamped[key] = w;");
  if (auditSource(brokenClamp).length === 0) throw new Error("SELFTEST FAIL: broken clamp (no flooring) went undetected");

  const reintroducedLiteral = good.replace("Math.max(MIN_COL_WIDTH_PX, x)", "Math.max(48, x)");
  if (auditSource(reintroducedLiteral).length === 0) throw new Error("SELFTEST FAIL: reintroduced literal 48 went undetected");

  console.log("verify-paritytable-col-width-floor: SELFTEST PASS (5/5)");
  process.exit(0);
}

const root = process.cwd();
let src;
try {
  src = fs.readFileSync(`${root}/${REL}`, "utf8");
} catch {
  console.error(`verify-paritytable-col-width-floor FAILED: ${REL} is missing`);
  process.exit(1);
}

const failures = auditSource(src);
if (failures.length) {
  console.error("verify-paritytable-col-width-floor FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-paritytable-col-width-floor: OK — persisted column widths below the resize floor (incl. 0px) clamp on load, every write path shares one named constant");
