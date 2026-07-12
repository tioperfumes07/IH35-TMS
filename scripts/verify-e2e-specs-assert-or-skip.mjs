#!/usr/bin/env node
/**
 * verify-e2e-specs-assert-or-skip.mjs  (0243-g7-4)
 *
 * Root cause: several Playwright e2e specs (bill/accident/expense/work-order/sidebar/forms/map-modal)
 * contained a `test(...)` body that asserted nothing — they reported GREEN and manufactured false
 * confidence. They have since been converted to explicit `test.skip(true, "<reason>")` (honestly
 * pending the auth-ready harness). This guard prevents the regression class: every e2e spec must either
 * make a real assertion (`expect(`) OR be explicitly skipped (`test.skip(true`) — never a silent
 * asserts-nothing "passing" test.
 *
 * Usage:
 *   node scripts/verify-e2e-specs-assert-or-skip.mjs            # scan
 *   node scripts/verify-e2e-specs-assert-or-skip.mjs --selftest # regression harness -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const E2E_DIR = "apps/frontend/e2e";

function walk(dir, acc = []) {
  const abs = path.join(repoRoot, dir);
  if (!fs.existsSync(abs)) return acc;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, acc);
    else if (entry.name.endsWith(".spec.ts")) acc.push(rel);
  }
  return acc;
}

function classify(src) {
  const hasAssertion = /\bexpect\s*\(/.test(src);
  const explicitlySkipped = /test\.skip\(\s*true/.test(src);
  return { hasAssertion, explicitlySkipped };
}

export function run() {
  const offenders = [];
  for (const rel of walk(E2E_DIR)) {
    const { hasAssertion, explicitlySkipped } = classify(fs.readFileSync(path.join(repoRoot, rel), "utf8"));
    if (!hasAssertion && !explicitlySkipped)
      offenders.push(`${rel}: asserts nothing (no expect(...)) and is not explicitly test.skip(true, ...) — false-green`);
  }
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const falseGreen = 'test("x", async () => { await page.goto("/"); });';
  const skipped = 'test.skip(true, "pending harness"); test("x", async () => {});';
  const real = 'test("x", async () => { expect(await page.title()).toBe("y"); });';
  const c1 = classify(falseGreen);
  const c2 = classify(skipped);
  const c3 = classify(real);
  const ok =
    !c1.hasAssertion && !c1.explicitlySkipped && // false-green flagged
    c2.explicitlySkipped && // skipped cleared
    c3.hasAssertion; // real cleared
  if (ok) {
    console.log("verify:e2e-specs-assert-or-skip selftest OK");
    process.exit(0);
  }
  console.error("verify:e2e-specs-assert-or-skip selftest FAILED");
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error("verify:e2e-specs-assert-or-skip FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log("verify:e2e-specs-assert-or-skip OK — every e2e spec asserts or is explicitly skipped");
}
