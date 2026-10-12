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
    // LEAD 443.99 class B (2026-10-12).
    //   old rule: the handle window contains a bg-slate-* class.
    //   new rule: the handle's className carries an AT-REST (no hover:/focus:/active: prefix) background that is
    //             either a slate-* or a house-token hex (bg-[#RRGGBB]) at >= 50% opacity.
    //   why: BANK-F91229 (#25897, 606a5b6afb) swept ParityTable's slate onto the owner house tokens
    //        (bg-slate-200/90 -> bg-[#E5E7EB]/90, the §7 border grey). Still opaque at rest; a hover-only,
    //        transparent or near-invisible (< 50%) grip still fails.
    const cls = (/className="([^"]*)"/.exec(win) ?? [])[1] ?? "";
    const atRest = cls.split(/\s+/).filter((t) => /^bg-/.test(t));
    const opaque = atRest.some((t) => {
      const m = /^bg-(?:slate-\d+|\[#[0-9A-Fa-f]{6}\])(?:\/(\d+))?$/.exec(t);
      return m && (m[1] === undefined || Number(m[1]) >= 50);
    });
    if (!opaque) {
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
  const plants = [
    ["handle removed", src.replace(/data-testid="parity-table-col-resize"/g, 'data-testid="gone"').replace(/\bw-2\b/g, "w-1")],
    ["hover-only grip", src.replace("bg-[#E5E7EB]/90 hover:bg-[#E5E7EB]", "hover:bg-[#E5E7EB]")],
    ["near-invisible grip", src.replace("bg-[#E5E7EB]/90 hover:bg-[#E5E7EB]", "bg-[#E5E7EB]/10 hover:bg-[#E5E7EB]")],
    ["transparent grip", src.replace("bg-[#E5E7EB]/90 hover:bg-[#E5E7EB]", "bg-transparent hover:bg-[#E5E7EB]")],
  ];
  let caughtCount = 0;
  for (const [name, planted] of plants) {
    if (planted !== src && assert(planted).length) caughtCount += 1;
    else console.error(`${LABEL} SELFTEST: planted defect escaped — ${name}`);
  }
  if (caughtCount !== plants.length || assert(src).length) {
    console.error(`${LABEL} SELFTEST FAIL — ${caughtCount}/${plants.length} caught; real source ${assert(src).length ? "flagged" : "clean"}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${caughtCount}/${plants.length} planted defects caught`);
  process.exit(0);
}

const problems = assert(src);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — ParityTable resize grip discoverable (w-2, opaque at rest)`);
process.exit(0);
