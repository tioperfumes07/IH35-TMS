#!/usr/bin/env node
/**
 * ACCT-F5648 — companion retirement to SET-01 (verify-no-deprecated-settlement-poster-mounted.mjs).
 * SET-01 retired the FIN-18 forward-posting route (/settlement-posting/post) via a 308 redirect to
 * the canonical payrun-close path, but its /reverse sibling was left live and genuinely callable,
 * reversing a poster whose forward counterpart no settlement in prod ever actually used (confirmed
 * via Neon: 0 rows match the ih35:settlement-gl:v1:%:initial_post idempotency-key pattern). Worse,
 * reverseSettlementGlPosting never flips driver_settlements.status the way the canonical void/cancel
 * executor (governance/void-cancel-executors.ts's executeDriverSettlement) does — so even in the
 * unreachable case where a stale settlement_id somehow hit this route, it would leave the settlement
 * in an inconsistent state (GL reversed, status untouched).
 *
 * FAIL if the /reverse handler still calls reverseSettlementGlPosting. PASS when it 308-redirects to
 * the canonical governance void/cancel request flow instead.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-deprecated-settlement-reverse-mounted";
const ROUTES = path.join(
  ROOT,
  "apps/backend/src/accounting/settlement-posting/settlement-posting.routes.ts"
);
const REVERSE_PATH = "/api/v1/accounting/settlement-posting/reverse";
const CANONICAL = "/api/v1/governance/void-cancel-requests";

export function analyzeRoutesSource(src) {
  const failures = [];
  // Strip block + line comments so docstrings cannot satisfy checks.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  if (!code.includes(REVERSE_PATH)) {
    failures.push(`${path.relative(ROOT, ROUTES)}: must still register ${REVERSE_PATH} (308 retirement, not silent delete)`);
  }
  if (/\breverseSettlementGlPosting\(/.test(code)) {
    failures.push(
      `${path.relative(ROOT, ROUTES)}: must NOT call reverseSettlementGlPosting from the /reverse handler (retired, GL-only, never flips driver_settlements.status)`
    );
  }
  if (!code.includes(CANONICAL)) {
    failures.push(`${path.relative(ROOT, ROUTES)}: 308 Location must point at ${CANONICAL} (the canonical void/cancel request flow)`);
  }
  // Handler for /reverse must not be a 200 success path that actually reverses, and the retirement
  // stub it delegates to (wherever defined in the file, before or after the route registration) must
  // reply with HTTP 308.
  const reverseIdx = code.indexOf(REVERSE_PATH);
  if (reverseIdx >= 0) {
    const window = code.slice(Math.max(0, reverseIdx - 800), reverseIdx + 400);
    if (!/code\(\s*308\s*\)/.test(window)) {
      failures.push(`${path.relative(ROOT, ROUTES)}: /reverse retirement must reply with HTTP 308`);
    }
    if (/reply\.code\(\s*200\s*\)\.send\(result\)/.test(code.slice(reverseIdx, reverseIdx + 600))) {
      failures.push(`${path.relative(ROOT, ROUTES)}: /reverse handler must not return 200 with a live result (still reversing)`);
    }
  }
  return failures;
}

export function run() {
  const src = fs.readFileSync(ROUTES, "utf8");
  return analyzeRoutesSource(src);
}

if (process.argv.includes("--selftest")) {
  const GOOD = `
const CANONICAL_VOID_CANCEL_REQUESTS = "/api/v1/governance/void-cancel-requests";
function retiredSettlementReverse(reply) {
  reply.header("location", CANONICAL_VOID_CANCEL_REQUESTS);
  return reply.code(308).send({ error: "gone", canonical_endpoint: CANONICAL_VOID_CANCEL_REQUESTS });
}
app.post("/api/v1/accounting/settlement-posting/reverse", async (req, reply) => {
  const user = ensureFinanceUser(req, reply);
  if (!user) return;
  return retiredSettlementReverse(reply);
});
`;
  if (analyzeRoutesSource(GOOD).length) {
    throw new Error(`[${LABEL}] selftest PASS fixture FAILED: ${analyzeRoutesSource(GOOD).join("; ")}`);
  }

  const BAD = `
app.post("/api/v1/accounting/settlement-posting/reverse", async (req, reply) => {
  const user = ensureFinanceUser(req, reply);
  if (!user) return;
  const result = await reverseSettlementGlPosting({ settlementId: body.data.settlement_id }, { userId: user.uuid });
  return reply.code(200).send(result);
});
`;
  if (!analyzeRoutesSource(BAD).length) {
    throw new Error(`[${LABEL}] selftest REGRESSION fixture should FAIL but passed`);
  }

  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — /settlement-posting/reverse is retired (308 to the canonical void/cancel request flow), reverseSettlementGlPosting never called from HTTP`);
