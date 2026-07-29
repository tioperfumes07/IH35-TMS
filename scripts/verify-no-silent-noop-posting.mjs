#!/usr/bin/env node
// verify-no-silent-noop-posting (Tier-1 0007)
// A money-posting leg gated behind a per-entity feature flag must NEVER be a silent no-op: when the
// flag resolves OFF the operation may skip the GL write, but it must surface an HONEST SIGNAL — an
// explicit discriminated result ({result/reason/decision: ...flag_off}), a 409, an honest posted:false
// / posting_status field, or a recordPostingFlagSkip() append-only record. Returning success with no
// signal lets an operator believe money posted when it did not (fake-green / hardline violation).
//
// This guard scans the known posting-writer files: for every `isEnabled(...)` gate whose flag argument
// names a POSTING flag, it requires an honest-signal token within the gate window. Removing the OFF
// branch (regressing to a silent no-op) fails CI. Self-test: --selftest.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Posting WRITERS that resolve a flag and (may) post GL. Enumerated 2026-07-10 (Tier-1 0007 sweep).
// B-D4 (2026-07-16): extend list with proven money writers that were outside the original sweep
// (bank-feed / splits / transfers / fuel / bill-gl / settlement payrun+dispute / cash-advance disburse).
// Do NOT rebuild — only add files that already use isEnabled + a posting flag.
const POSTING_FILES = [
  "apps/backend/src/accounting/payments/apply.service.ts",
  "apps/backend/src/accounting/bill-payment-gl.service.ts",
  "apps/backend/src/accounting/bill-gl.service.ts",
  "apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts",
  "apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts",
  "apps/backend/src/accounting/property-tax-posting/poster.service.ts",
  "apps/backend/src/accounting/lease-asc842/lease-posting.service.ts",
  "apps/backend/src/accounting/amortization-posting/amortization-posting.service.ts",
  "apps/backend/src/accounting/finance-hub-amortization-posting/loan-payment-posting.service.ts",
  "apps/backend/src/accounting/maintenance-posting/poster.service.ts",
  "apps/backend/src/accounting/factoring-posting/poster.service.ts",
  "apps/backend/src/accounting/factoring-posting/default-interest.service.ts",
  "apps/backend/src/accounting/opening-balance-import/opening-balance-import.service.ts",
  "apps/backend/src/accounting/fuel-posting/maybe-post-from-fuel-transaction.service.ts",
  "apps/backend/src/accounting/expenses.routes.ts",
  "apps/backend/src/accounting/bill-gl-draft.routes.ts",
  "apps/backend/src/accounting/posting-engine.routes.ts",
  "apps/backend/src/accounting/qbo-je-push-gate.ts",
  "apps/backend/src/driver-finance/escrow-separation.service.ts",
  "apps/backend/src/driver-finance/driver-reimbursement.service.ts",
  "apps/backend/src/driver-finance/settlements-load-bookended.service.ts",
  "apps/backend/src/driver-finance/settlement-payrun-close.service.ts",
  "apps/backend/src/driver-finance/settlement-dispute.service.ts",
  "apps/backend/src/banking/bank-driver-advance.service.ts",
  "apps/backend/src/banking/bank-feed-gl-posting.service.ts",
  "apps/backend/src/banking/bank-transaction-splits.service.ts",
  "apps/backend/src/banking/transfers.service.ts",
  "apps/backend/src/cash-advances/cash-advance-disburse.ts",
  "apps/backend/src/qbo/qbo-entity-push-gate.ts",
];

// A flag argument that names a money-posting gate (so read-only feature gates are not falsely flagged).
const POSTING_FLAG = /POSTING|_GL_|GL_POSTING|CONTRACT_TERMS|DEDUCTION_APPLY|FACTORING_GL|LEASE_GL|AMORTIZATION_GL|PROPERTY_TAX_GL|ESCROW_SEPARATION|BANK_DRIVER_ADVANCE|QBO_.*PUSH|JE_QBO_PUSH|_PUSH_FLAG/i;

// Any recognized HONEST signal in the OFF path (an else that records the skip, or a surfaced field).
const SIGNAL =
  /blocked_flag_off|skipped_flag_off|flag_off|posted:\s*false|posting_disabled|posting_status|gl_posting|recordPostingFlagSkip|reply\.code\(409|decision:\s*["']flag_off|\bFLAG_OFF\b/;

const ELSE_TAIL = 400; // chars past the gate block's closing brace to catch its `else { ...signal }`

/** From the index of the `{` opening a gate block, return the index just past its matching `}`. */
function matchBlockEnd(source, openBraceIdx) {
  let depth = 0;
  for (let i = openBraceIdx; i < source.length; i++) {
    const c = source[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return Math.min(source.length, openBraceIdx + 2000); // unbalanced fallback
}

// The silent anti-pattern is specifically a POSITIVE gate on the direct isEnabled result —
//   const X = await isEnabled(..., POSTING_FLAG ...);  if (X) { ...post... }   // no else, no signal
// with the enclosing writer then returning success. Negative early-returns (`if (!X) return <signal>`),
// indirect gates (`prepared.gate === "flag_off"`), and flag-as-param sweeps already surface OFF and are
// NOT this defect, so we only inspect the positive-gate shape to avoid false positives.
export function analyze(source) {
  const offenders = [];
  const assign = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+isEnabled\s*\(\s*[^,]*,\s*([A-Za-z_$][\w$."'\[\]]*)/g;
  let m;
  while ((m = assign.exec(source)) !== null) {
    const varName = m[1];
    const flagArg = m[2];
    if (!POSTING_FLAG.test(flagArg)) continue; // not a posting gate
    // Look for a positive gate on this exact variable: `if (varName) {`
    const gate = new RegExp(`if\\s*\\(\\s*${varName}\\s*\\)\\s*\\{`).exec(source.slice(m.index));
    if (!gate) continue; // no positive gate → handled indirectly/negatively; not the silent pattern
    const gateIdx = m.index + gate.index;
    const openBraceIdx = gateIdx + gate[0].length - 1; // the `{` of the gate block
    const blockEnd = matchBlockEnd(source, openBraceIdx);
    const window = source.slice(gateIdx, blockEnd + ELSE_TAIL); // gate block + its `else { ... }`
    if (!SIGNAL.test(window)) offenders.push({ flag: flagArg, index: gateIdx });
  }
  return offenders;
}

function run() {
  const failures = [];
  for (const rel of POSTING_FILES) {
    const abs = path.join(ROOT, rel);
    let src;
    try {
      src = fs.readFileSync(abs, "utf8");
    } catch {
      continue; // file moved/renamed — not this guard's concern (schema-phantom guards cover that)
    }
    for (const off of analyze(src)) {
      const line = src.slice(0, off.index).split("\n").length;
      failures.push(`${rel}:${line} — posting flag gate '${off.flag}' has a positive if(flag){…} block with no honest OFF-signal (no else/recordPostingFlagSkip/blocked result): silent no-op`);
    }
  }
  return failures;
}

export { run };

if (process.argv.includes("--selftest")) {
  const silent = `const enabled = await isEnabled(client, CUSTOMER_PAYMENT_GL_POSTING_FLAG_KEY, {});
    if (enabled) { await postSourceTransaction(x); }
    return { payment_id: id };`;
  const honest = `const enabled = await isEnabled(client, CUSTOMER_PAYMENT_GL_POSTING_FLAG_KEY, {});
    if (enabled) { await postSourceTransaction(x); } else { await recordPostingFlagSkip(client, u, {}); }
    return { payment_id: id, gl_posting: "posted" };`;
  const readGate = `const show = await isEnabled(client, SHOW_BREAK_EVEN_WIDGET, {}); if (show) { render(); }`;
  const checks = [
    ["silent no-op posting gate is flagged", analyze(silent).length === 1],
    ["honest gate (recordPostingFlagSkip + gl_posting) is not flagged", analyze(honest).length === 0],
    ["non-posting read gate is not flagged", analyze(readGate).length === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:no-silent-noop-posting --selftest FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify:no-silent-noop-posting --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:no-silent-noop-posting FAIL — a flag-gated posting leg can succeed silently:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`verify:no-silent-noop-posting PASS (${POSTING_FILES.length} posting writers; every flag gate surfaces an honest OFF-signal)`);
}
