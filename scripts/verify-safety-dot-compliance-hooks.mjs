#!/usr/bin/env node
/**
 * verify-safety-dot-compliance-hooks.mjs
 * LV-SAFETY-DOT-COMPLIANCE-CRASH — DOTComplianceTab must not call hooks after
 * an early return on !companyId (Rules of Hooks → Live error boundary).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-safety-dot-compliance-hooks";
const TARGET = "apps/frontend/src/pages/safety/tabs/DOTComplianceTab.tsx";

function hooksAfterEarlyReturn(src) {
  const early = src.search(/if\s*\(\s*!companyId\s*\)\s*\{[\s\S]*?return\s+/);
  if (early < 0) return { ok: false, reason: "missing !companyId early return" };
  const after = src.slice(early);
  if (/\buse(Memo|Mutation|Query|State|Effect)\s*\(/.test(after)) {
    return { ok: false, reason: "hook call appears after !companyId early return (Rules of Hooks)" };
  }
  return { ok: true };
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const bad = `
export function DOTComplianceTab() {
  const companyId = "";
  if (!companyId) { return <div />; }
  const x = useMemo(() => 1, []);
  return null;
}`;
  const good = `
export function DOTComplianceTab() {
  const companyId = "";
  const x = useMemo(() => 1, []);
  if (!companyId) { return <div />; }
  return null;
}`;
  const badHit = hooksAfterEarlyReturn(bad);
  const goodHit = hooksAfterEarlyReturn(good);
  if (badHit.ok) fail("selftest expected BAD snippet to fail");
  if (!goodHit.ok) fail(`selftest expected GOOD snippet to pass: ${goodHit.reason}`);
  // BANK-F91250 leftover plant on DOTComplianceTab
  const original = fs.readFileSync(path.join(process.cwd(), TARGET), "utf8");
  {
    // planted into a string -- no file is written
    const plant = `${original}\n<div className="text-[11px] text-[#8A92AB]">plant</div>\n`;
    const leftoverHits = [];
    if (plant.includes("text-[11px]")) leftoverHits.push("leftover text-[11px]");
    if (plant.includes("#8A92AB") || plant.includes("#334155")) leftoverHits.push("leftover off-scale muted");
    if (!leftoverHits.includes("leftover text-[11px]") || !leftoverHits.includes("leftover off-scale muted")) {
      fail(`leftover plant escaped: ${leftoverHits.join("; ")}`);
    }
  }
  console.log(`${LABEL} selftest PASS — detects hook-after-return; leftover plant rejected`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = fs.readFileSync(path.join(process.cwd(), TARGET), "utf8");
const hit = hooksAfterEarlyReturn(src);
if (!hit.ok) fail(hit.reason);
// BANK-F91250 leftover refuse — DOTComplianceTab only
if (src.includes("text-[11px]")) fail("leftover text-[11px]");
if (src.includes("#8A92AB") || src.includes("#334155")) fail("leftover off-scale muted");
console.log(`${LABEL} PASS — hooks precede !companyId early return`);
