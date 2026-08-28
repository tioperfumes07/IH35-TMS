#!/usr/bin/env node
/**
 * verify-driver-rate-effective-date-company-business-date.mjs (DRV-MONEY-F6959)
 *
 * DriverDetail.tsx's qualification-rate change form initialized and reset `effective_from` from
 * `new Date().toISOString().slice(0, 10)` -- UTC's calendar date, not the company's own business
 * day. A rate change filed in the evening Central (UTC-5/-6) can land after UTC midnight, making the
 * change effective "tomorrow" from the operator's own perspective and shifting when settlement
 * economics actually start using the new rate -- a real, silent one-day drift on a money-bearing
 * field. The rest of this exact file already uses the canonical `companyToday()` helper for the
 * same purpose (event_date, qualified_at) -- this was the two spots that never got the same fix.
 *
 * This guard asserts, against the REAL file, that BOTH `effective_from` sites (the form's initial
 * useState default and the edit-button's reset) call `companyToday()`, not `new Date().toISOString()`.
 *
 * FAIL if either site regresses to a raw UTC date.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-rate-effective-date-company-business-date";
const TARGET_FILE = "apps/frontend/src/pages/DriverDetail.tsx";

function readReal(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * Injectable core: pass `src` to exercise this exact function against synthetic content; omit it
 * to check the real repo file.
 */
export function check(src) {
  const failures = [];
  const source = src != null ? src : (() => { try { return readReal(TARGET_FILE); } catch { return null; } })();
  if (source == null) return [`${TARGET_FILE} not found`];

  // Site 1: the rateChangeForm initial useState. Anchor on "amount: ''," immediately preceding the
  // effective_from line (not the first `effective_from` match in the file, since there are unrelated
  // read-only usages like a sort column render further down).
  const initIdx = source.indexOf('amount: "",');
  if (initIdx < 0) {
    failures.push(`${TARGET_FILE}: rateChangeForm's initial "amount: \"\"," anchor not found -- extractor may be stale`);
  } else {
    const after = source.slice(initIdx, initIdx + 400);
    if (!/effective_from:\s*companyToday\(\)/.test(after)) {
      failures.push(
        `${TARGET_FILE}: rateChangeForm's initial effective_from no longer calls companyToday() -- ` +
          `it may have regressed to a raw UTC date`
      );
    }
  }

  // Site 2: the edit-button's setRateChangeForm reset. Anchor on the amount line right before it.
  const resetIdx = source.indexOf('amount: line.amount ? String(line.amount) : "",');
  if (resetIdx < 0) {
    failures.push(`${TARGET_FILE}: rate-edit button's amount reset line not found -- extractor may be stale`);
  } else {
    const after = source.slice(resetIdx, resetIdx + 400);
    if (!/effective_from:\s*companyToday\(\)/.test(after)) {
      failures.push(
        `${TARGET_FILE}: rate-edit button's effective_from reset no longer calls companyToday() -- ` +
          `it may have regressed to a raw UTC date`
      );
    }
  }

  return failures;
}

export { check as run };

if (process.argv.includes("--selftest")) {
  // Padding between the two blocks matters: a check() window wide enough to reach the OTHER site's
  // companyToday() would let a mutation at one site hide behind the other's still-correct call,
  // exactly the "decoy match" trap this guard's own real-file window is sized to avoid.
  const PADDING = "\n    // padding line to keep the two sites farther apart than either check window\n".repeat(20);
  const good = `
    const [rateChangeForm, setRateChangeForm] = useState({
      amount: "",
      effective_from: companyToday(),
      change_reason: "raise",
    });
${PADDING}
    onClick={() => {
      setRateChangeForm((current) => ({
        ...current,
        amount: line.amount ? String(line.amount) : "",
        effective_from: companyToday(),
      }));
    }}
  `;
  const regressedInit = good.replace(
    'amount: "",\n      effective_from: companyToday(),',
    'amount: "",\n      effective_from: new Date().toISOString().slice(0, 10),'
  );
  const regressedReset = good.replace(
    'amount: line.amount ? String(line.amount) : "",\n        effective_from: companyToday(),',
    'amount: line.amount ? String(line.amount) : "",\n        effective_from: new Date().toISOString().slice(0, 10),'
  );

  const checks = [
    ["fully-fixed shape produces zero failures", check(good).length === 0],
    ["initial effective_from regressing to UTC is caught", check(regressedInit).some((f) => f.includes("initial effective_from"))],
    ["reset effective_from regressing to UTC is caught", check(regressedReset).some((f) => f.includes("reset no longer calls"))],
    ["real repo file currently satisfies this guard (no args = real file)", check().length === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = check();
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — driver qualification-rate change effective_from uses the company business date, not raw UTC`);
}
