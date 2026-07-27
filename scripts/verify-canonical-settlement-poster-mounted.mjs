#!/usr/bin/env node
/**
 * SET-04 — canonical Bill+BillPayment settlement poster must have a mounted forward HTTP route.
 *
 * FAIL if no production *.routes.ts registers a forward handler that calls postSettlementBillPayment.
 * PASS when a role-gated POST route invokes postSettlementBillPayment and the engine remains
 * SETTLEMENT_GL_POSTING_ENABLED-gated (OFF => skipped_flag_off).
 *
 * Prove: fails on pre-fix main; passes on this fix.
 * --selftest mutates the real routes source (write + restore).
 *
 * Rule 17: verify-step only — do not edit package.json / locked-guards / ci.yml.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-canonical-settlement-poster-mounted";
const ROUTES = path.join(
  ROOT,
  "apps/backend/src/accounting/settlement-posting/settlement-posting.routes.ts"
);
const ENGINE = path.join(
  ROOT,
  "apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts"
);
const FORWARD_PATH = "/api/v1/accounting/settlement-posting/bill-payment-post";

export function analyzeRoutesSource(src) {
  const failures = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  if (!/\bpostSettlementBillPayment\b/.test(code)) {
    failures.push(`${path.relative(ROOT, ROUTES)}: must import and call postSettlementBillPayment`);
  }
  if (!code.includes(FORWARD_PATH)) {
    failures.push(`${path.relative(ROOT, ROUTES)}: must register forward POST ${FORWARD_PATH}`);
  }
  const postMatch = code.match(
    /app\.post\s*\(\s*["']\/api\/v1\/accounting\/settlement-posting\/bill-payment-post["']/
  );
  if (!postMatch) {
    failures.push(`${path.relative(ROOT, ROUTES)}: ${FORWARD_PATH} must be an app.post forward handler`);
  } else {
    const window = code.slice(postMatch.index, postMatch.index + 2000);
    if (!/postSettlementBillPayment\s*\(/.test(window)) {
      failures.push(`${path.relative(ROOT, ROUTES)}: ${FORWARD_PATH} handler must call postSettlementBillPayment(`);
    }
    if (!/ensureFinanceUser|requireAuth|financeRoles|AUTHORITY_ROLES/.test(window)) {
      failures.push(`${path.relative(ROOT, ROUTES)}: ${FORWARD_PATH} must be role/auth gated`);
    }
  }
  return failures;
}

export function analyzeEngineSource(src) {
  const failures = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/SETTLEMENT_GL_POSTING_FLAG_KEY/.test(code) || !/skipped_flag_off/.test(code)) {
    failures.push(
      `${path.relative(ROOT, ENGINE)}: postSettlementBillPayment must remain SETTLEMENT_GL_POSTING_ENABLED-gated (skipped_flag_off)`
    );
  }
  return failures;
}

export function run() {
  const failures = [];
  if (!fs.existsSync(ROUTES)) {
    return [`missing ${path.relative(ROOT, ROUTES)}`];
  }
  failures.push(...analyzeRoutesSource(fs.readFileSync(ROUTES, "utf8")));
  if (!fs.existsSync(ENGINE)) {
    failures.push(`missing ${path.relative(ROOT, ENGINE)}`);
  } else {
    failures.push(...analyzeEngineSource(fs.readFileSync(ENGINE, "utf8")));
  }
  return failures;
}

function selftest() {
  const live = run();
  if (live.length) {
    console.error(`[${LABEL}] --selftest FAIL: clean tree must PASS first:`);
    for (const f of live) console.error(`  ✗ ${f}`);
    process.exit(1);
  }

  const original = fs.readFileSync(ROUTES, "utf8");
  const planted = original.replace(
    /app\.post\(\s*"\/api\/v1\/accounting\/settlement-posting\/bill-payment-post"[\s\S]*?\n\s*\}\);/,
    `// SET-04 forward route removed (planted defect for selftest)`
  );
  if (planted === original) {
    console.error(`[${LABEL}] --selftest FAIL: could not locate bill-payment-post handler to mutate`);
    process.exit(1);
  }

  try {
    fs.writeFileSync(ROUTES, planted, "utf8");
    const bad = run();
    if (bad.length === 0) {
      console.error(`[${LABEL}] --selftest FAIL: removing forward route did not fail the guard`);
      process.exit(1);
    }
  } finally {
    fs.writeFileSync(ROUTES, original, "utf8");
  }

  const restored = run();
  if (restored.length) {
    console.error(`[${LABEL}] --selftest FAIL: restore left tree red:`);
    for (const f of restored) console.error(`  ✗ ${f}`);
    process.exit(1);
  }

  console.log(`[${LABEL}] --selftest PASS (live green + planted unmount fails + restored)`);
  process.exit(0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  const failures = run();
  if (failures.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(
    `[${LABEL}] PASS — postSettlementBillPayment forward route mounted at ${FORWARD_PATH} (flag-gated in engine)`
  );
}
