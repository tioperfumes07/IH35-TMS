#!/usr/bin/env node
/**
 * SET-01 — deprecated FIN-18 settlement poster must not be a live money mount.
 *
 * FAIL if apps/backend/src/accounting/settlement-posting/settlement-posting.routes.ts
 * still calls postSettlementToGl from the /api/v1/accounting/settlement-posting/post handler
 * (or anywhere in that routes file). PASS when the /post route 308-redirects to payrun-close
 * and never imports/invokes postSettlementToGl.
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
const LABEL = "verify-no-deprecated-settlement-poster-mounted";
const ROUTES = path.join(
  ROOT,
  "apps/backend/src/accounting/settlement-posting/settlement-posting.routes.ts"
);
const POST_PATH = "/api/v1/accounting/settlement-posting/post";
const CANONICAL = "/api/v1/driver-finance/settlements";

export function analyzeRoutesSource(src) {
  const failures = [];
  // Strip block + line comments so docstrings cannot satisfy checks.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  if (!code.includes(POST_PATH)) {
    failures.push(`${ROUTES}: must still register ${POST_PATH} (308 retirement, not silent delete)`);
  }
  if (/\bpostSettlementToGl\b/.test(code)) {
    failures.push(
      `${path.relative(ROOT, ROUTES)}: must NOT import or call postSettlementToGl (FIN-18 mis-router)`
    );
  }
  if (!/\.code\(\s*308\s*\)/.test(code) && !/code\(308\)/.test(code)) {
    failures.push(`${path.relative(ROOT, ROUTES)}: /post retirement must reply with HTTP 308`);
  }
  if (!code.includes("payrun-close") || !code.includes(CANONICAL)) {
    failures.push(
      `${path.relative(ROOT, ROUTES)}: 308 Location must point at ${CANONICAL}/:id/payrun-close`
    );
  }
  // Handler for /post must not be a 200/201 success path that "posts"
  const postIdx = code.indexOf(POST_PATH);
  if (postIdx >= 0) {
    const window = code.slice(postIdx, postIdx + 800);
    if (/reply\.code\(\s*201\s*\)/.test(window) || /result\.result\s*===\s*["']posted["']/.test(window)) {
      failures.push(`${path.relative(ROOT, ROUTES)}: /post handler must not return 201/posted (still posting)`);
    }
  }
  return failures;
}

export function run() {
  if (!fs.existsSync(ROUTES)) {
    return [`missing ${path.relative(ROOT, ROUTES)}`];
  }
  return analyzeRoutesSource(fs.readFileSync(ROUTES, "utf8"));
}

function selftest() {
  const live = run();
  if (live.length) {
    console.error(`[${LABEL}] --selftest FAIL: clean tree must PASS first:`);
    for (const f of live) console.error(`  ✗ ${f}`);
    process.exit(1);
  }

  const original = fs.readFileSync(ROUTES, "utf8");
  // Plant the pre-fix defect: call postSettlementToGl again from the /post route.
  const planted = original.replace(
    /app\.post\(\s*"\/api\/v1\/accounting\/settlement-posting\/post"[\s\S]*?\n\s*\}\);/,
    `app.post("${POST_PATH}", async (req, reply) => {
    const result = await postSettlementToGl({ settlementId: "x" }, { userId: "y" });
    return reply.code(201).send(result);
  });`
  );
  if (planted === original) {
    console.error(`[${LABEL}] --selftest FAIL: could not locate /post handler to mutate`);
    process.exit(1);
  }

  try {
    fs.writeFileSync(ROUTES, planted, "utf8");
    const bad = analyzeRoutesSource(fs.readFileSync(ROUTES, "utf8"));
    if (bad.length === 0) {
      console.error(`[${LABEL}] --selftest FAIL: planted postSettlementToGl call did not fail the guard`);
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

  console.log(`[${LABEL}] --selftest PASS (live green + real-source plant fails + restored)`);
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
  console.log(`[${LABEL}] PASS — FIN-18 /settlement-posting/post is 308-retired (no postSettlementToGl mount)`);
}
