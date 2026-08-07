#!/usr/bin/env node
/**
 * CUST-CHROME-03 — ParityTable column resize must be discoverable at rest
 * (opaque slate grip ≥ w-2), not a near-invisible 4–6px hover-only strip.
 *
 *   node scripts/verify-parity-table-resize-affordance.mjs
 *   node scripts/verify-parity-table-resize-affordance.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-parity-table-resize-affordance";
const FILE = "apps/frontend/src/components/parity/ParityTable.tsx";

function assert(src) {
  const problems = [];
  if (!/data-testid="parity-table-col-resize"/.test(src)) {
    problems.push(`${FILE}: missing data-testid=parity-table-col-resize`);
  }
  if (!/role="separator"/.test(src) || !/cursor-col-resize/.test(src)) {
    problems.push(`${FILE}: resize handle must be role=separator with cursor-col-resize`);
  }
  // Discoverability: opaque slate strip + w-2 (8px), not transparent-only / w-1 / w-1.5 alone.
  const handleIdx = src.indexOf('data-testid="parity-table-col-resize"');
  if (handleIdx >= 0) {
    const win = src.slice(Math.max(0, handleIdx - 80), handleIdx + 700);
    if (!/\bw-2\b/.test(win)) {
      problems.push(`${FILE}: resize handle must use w-2 (8px) hit target`);
    }
    if (!/bg-slate-/.test(win)) {
      problems.push(`${FILE}: resize handle must use opaque §7 slate background at rest`);
    }
    if (/bg-transparent|opacity-0|invisible/.test(win)) {
      problems.push(`${FILE}: resize handle must not be transparent/invisible at rest`);
    }
  }
  if (!/onKeyDown=\{\(e\) => onResizeKey/.test(src) && !/onKeyDown=\{\(e\) => onResizeKey\(key, e\)\}/.test(src)) {
    if (!/onResizeKey/.test(src)) {
      problems.push(`${FILE}: keyboard resize path (onResizeKey) required`);
    }
  }
  return problems;
}

const src = readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const planted = src
    .replace(/data-testid="parity-table-col-resize"/g, 'data-testid="gone"')
    .replace(/\bw-2\b/g, "w-1");
  const caught = assert(planted);
  if (!caught.length) {
    console.error(`${LABEL} SELFTEST FAIL — planted defect not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(src);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — ParityTable resize grip discoverable (w-2 slate)`);
process.exit(0);
