#!/usr/bin/env node
/**
 * verify-finance-hub-off-honest-state.mjs  (audit gap #14 — "Finance Hub default OFF wall")
 *
 * Owner root cause: the Finance Hub is OFF by default and enabled per operating company (owner-gated,
 * read-only). When the flag is OFF, operators must NOT see a blank/crashing screen or a raw internal
 * flag name — that reads as "the module is broken." The honest fix is a reachable disabled state:
 * the finance sub-nav stays rendered, an owner/operator message explains it is expected (not an error)
 * and says to contact the owner/admin, and NO fake hub data is invented.
 *
 * This is a REGRESSION guard: it locks the OFF branch of FinanceHubPage.tsx so it can never silently
 * revert to a blank wall (`return null`), lose its sub-nav (unreachable), invent KPI data on the OFF
 * path, or leak the raw feature-flag identifier into operator copy.
 *
 *   - The page MUST have an OFF branch: `if (!enabled)`.
 *   - The OFF branch MUST render the finance sub-nav (<FinanceModuleTabs) — module stays reachable (rule 07).
 *   - The OFF branch MUST render an honest disabled marker + operator guidance (contact owner/admin).
 *   - The OFF branch MUST NOT `return null` / render nothing (blank wall).
 *   - The OFF branch MUST NOT invent fake hub data (no getFinanceHubOverview / .kpis on the OFF path).
 *   - The OFF branch MUST NOT expose the raw flag identifier FINANCE_HUB_UI_ENABLED in operator copy.
 *
 * Usage:
 *   node scripts/verify-finance-hub-off-honest-state.mjs            # scan
 *   node scripts/verify-finance-hub-off-honest-state.mjs --selftest # exercises pass + violation fixtures
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const TARGET = "apps/frontend/src/pages/finance/FinanceHubPage.tsx";
const LABEL = "verify-finance-hub-off-honest-state";

// Extract the body of the first `if (!enabled)` block via brace matching. Returns "" if not found.
function extractOffBranch(src) {
  const marker = /if\s*\(\s*!\s*enabled\s*\)/;
  const m = marker.exec(src);
  if (!m) return null;
  const braceStart = src.indexOf("{", m.index);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(braceStart + 1, i);
    }
  }
  return null;
}

function assertHonestOffState(src, where) {
  const failures = [];
  const off = extractOffBranch(src);
  if (off == null) {
    failures.push(`${where}: no OFF branch found (expected \`if (!enabled)\`)`);
    return failures;
  }
  // 1. Not a blank wall.
  if (/return\s+null\b/.test(off) || /return\s*\(\s*\)\s*;/.test(off)) {
    failures.push(`${where}: OFF branch returns null / nothing — that is the blank wall this guard forbids`);
  }
  // 2. Module stays reachable — sub-nav rendered in the OFF branch.
  if (!/<FinanceModuleTabs\b/.test(off)) {
    failures.push(`${where}: OFF branch must render <FinanceModuleTabs /> so the module stays reachable (rule 07)`);
  }
  // 3. Honest disabled marker present (testable hook).
  if (!/data-testid=["']finance-hub-disabled["']/.test(off)) {
    failures.push(`${where}: OFF branch must render the honest disabled marker data-testid="finance-hub-disabled"`);
  }
  // 4. Operator guidance — tell them what to do, not just that it's off.
  const hasNotEnabled = /not\s+enabled/i.test(off);
  const hasContact = /contact\s+(the\s+)?(owner|admin|administrator)/i.test(off);
  if (!hasNotEnabled || !hasContact) {
    failures.push(
      `${where}: OFF branch must give honest operator guidance (found "not enabled":${hasNotEnabled}, "contact owner/admin":${hasContact})`,
    );
  }
  // 5. No fake hub data on the OFF path.
  if (/getFinanceHubOverview\s*\(/.test(off) || /\.kpis\b/.test(off)) {
    failures.push(`${where}: OFF branch must not fetch/render hub KPI data (no fake data when disabled)`);
  }
  // 6. Do not leak the raw internal flag identifier into operator-visible copy.
  if (/FINANCE_HUB_UI_ENABLED/.test(off)) {
    failures.push(`${where}: OFF branch must not expose the raw flag identifier FINANCE_HUB_UI_ENABLED to operators`);
  }
  return failures;
}

export function run() {
  const full = path.join(repoRoot, TARGET);
  if (!fs.existsSync(full)) {
    console.error(`[${LABEL}] FAIL — target missing: ${TARGET}`);
    return { ok: false, offenders: [`${TARGET} — MISSING`] };
  }
  const src = fs.readFileSync(full, "utf8");
  const failures = assertHonestOffState(src, TARGET);
  if (failures.length) {
    console.error(`[${LABEL}] FAIL — Finance Hub OFF state is not honestly reachable:`);
    for (const f of failures) console.error(`  - ${f}`);
    return { ok: false, offenders: failures };
  }
  console.log(`[${LABEL}] PASS — Finance Hub OFF path renders an honest, reachable disabled state`);
  return { ok: true, offenders: [] };
}

export function check() {
  return run().ok;
}

function selftest() {
  const good = `
    if (!enabled) {
      return (
        <div className="p-6">
          <FinanceModuleTabs />
          {header}
          <div data-testid="finance-hub-disabled">
            <p>Finance Hub is not enabled for this entity.</p>
            <p>Contact the owner or an administrator to enable it.</p>
          </div>
        </div>
      );
    }
  `;
  const badBlank = `
    if (!enabled) {
      return null;
    }
  `;
  const badNoTabs = `
    if (!enabled) {
      return (
        <div data-testid="finance-hub-disabled">
          <p>Finance Hub is not enabled. Contact the owner.</p>
        </div>
      );
    }
  `;
  const badLeaksFlag = `
    if (!enabled) {
      return (
        <div className="p-6">
          <FinanceModuleTabs />
          <div data-testid="finance-hub-disabled">
            The Finance Hub is not enabled. Contact the owner. (Flag FINANCE_HUB_UI_ENABLED is off.)
          </div>
        </div>
      );
    }
  `;

  const cases = [
    { name: "honest reachable OFF state", src: good, expectPass: true },
    { name: "blank wall (return null)", src: badBlank, expectPass: false },
    { name: "unreachable (no sub-nav)", src: badNoTabs, expectPass: false },
    { name: "leaks raw flag name", src: badLeaksFlag, expectPass: false },
  ];
  let failed = false;
  for (const c of cases) {
    const failures = assertHonestOffState(c.src, "<fixture>");
    const passed = failures.length === 0;
    if (passed !== c.expectPass) {
      failed = true;
      console.error(`[${LABEL}] SELFTEST FAIL — "${c.name}" expected ${c.expectPass ? "PASS" : "FAIL"} but got ${passed ? "PASS" : "FAIL"}`);
      for (const f of failures) console.error(`    - ${f}`);
    }
  }
  if (failed) process.exit(1);
  console.log(`[${LABEL}] SELFTEST PASS — accepts honest OFF state; rejects blank wall / unreachable / flag leak`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
