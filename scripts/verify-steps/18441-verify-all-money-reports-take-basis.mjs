#!/usr/bin/env node
/**
 * 18441 — 443.139 #8(c): all money reports take a basis parameter
 *
 * Guards P&L, balance sheet, trial balance, A/R aging, A/P aging,
 * account register, and cash flow to ensure each route schema
 * declares `basis` (accrual/cash toggle). AR/AP aging are Q4-locked
 * to accrual-only but must still accept and echo the param.
 *
 * Self-test: --selftest removes the basis declaration from a probe
 * copy and asserts the guard catches it, then restores.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "../..");

// Each entry: the route file and the pattern that proves basis is declared.
// The pattern is intentionally loose — any z.enum(["accrual","cash"]) or
// basis: z.enum(...) line suffices.
const TARGETS = [
  {
    file: "apps/backend/src/accounting/profit-loss.routes.ts",
    desc: "P&L",
    pattern: /basis.*z\.enum.*accrual.*cash|z\.enum.*accrual.*cash.*basis/,
  },
  {
    file: "apps/backend/src/accounting/balance-sheet.routes.ts",
    desc: "balance sheet",
    pattern: /basis.*z\.enum.*accrual.*cash|z\.enum.*accrual.*cash.*basis/,
  },
  {
    file: "apps/backend/src/accounting/trial-balance.routes.ts",
    desc: "trial balance",
    pattern: /basis.*z\.enum.*accrual.*cash|z\.enum.*accrual.*cash.*basis/,
  },
  {
    file: "apps/backend/src/accounting/ar-aging.routes.ts",
    desc: "A/R aging (Q4: accrual-only, but accepts param)",
    pattern: /basis.*z\.enum.*accrual.*cash|z\.enum.*accrual.*cash.*basis/,
  },
  {
    file: "apps/backend/src/accounting/ap-aging.routes.ts",
    desc: "A/P aging (Q4: accrual-only, but accepts param)",
    pattern: /basis.*z\.enum.*accrual.*cash|z\.enum.*accrual.*cash.*basis/,
  },
  {
    file: "apps/backend/src/accounting/account-register.routes.ts",
    desc: "account register",
    pattern: /basis.*z\.enum.*accrual.*cash|z\.enum.*accrual.*cash.*basis/,
  },
  {
    file: "apps/backend/src/accounting/cash-flow.routes.ts",
    desc: "cash flow",
    pattern: /basis.*z\.enum.*accrual.*cash|z\.enum.*accrual.*cash.*basis/,
  },
];

function check(targets) {
  const findings = [];
  for (const { file, desc, pattern } of targets) {
    const abs = resolve(ROOT, file);
    let src;
    try {
      src = readFileSync(abs, "utf8");
    } catch {
      findings.push(`MISSING file: ${file} (${desc})`);
      continue;
    }
    if (!pattern.test(src)) {
      findings.push(`${file}: ${desc} — no basis z.enum(["accrual","cash"]) declaration found`);
    }
  }
  return findings;
}

if (process.argv.includes("--selftest")) {
  // Mutate the first target to remove basis declaration temporarily
  const probe = resolve(ROOT, TARGETS[0].file);
  const original = readFileSync(probe, "utf8");
  // Replace the basis enum line with a comment so the pattern doesn't match
  const mutated = original.replace(
    /basis.*z\.enum.*["']accrual["'].*["']cash["'][^\n]*/,
    "// SELFTEST_PROBE — basis removed"
  );
  if (mutated === original) {
    console.error("SELFTEST FAIL: could not inject probe — source pattern did not match");
    process.exit(1);
  }
  writeFileSync(probe, mutated);
  const findings = check(TARGETS);
  writeFileSync(probe, original);
  if (findings.length === 0) {
    console.error("SELFTEST FAIL: guard did not catch removed basis declaration");
    process.exit(1);
  }
  console.log(`SELFTEST PASS: caught ${findings.length} finding(s)`);
  process.exit(0);
}

const findings = check(TARGETS);
if (findings.length > 0) {
  console.error(`18441 FAIL: ${findings.length} money report(s) missing basis declaration:`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log("18441 PASS: all 7 money reports declare basis (accrual/cash) in their route schema");
process.exit(0);
