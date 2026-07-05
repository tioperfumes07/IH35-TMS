#!/usr/bin/env node
/**
 * verify-all-posting-paths-gated.mjs  (permanent kill-switch guard)
 *
 * EVERY GL-posting path must honor its per-entity feature flag. This guard FAILS if a call site that
 * posts to the GL via `postSourceTransaction(<posting type>)` lacks an `isEnabled(...)` gate for the
 * matching per-entity posting flag. It gives teeth to the "no unflagged money posting" rule: removing a
 * gate (or adding a new ungated posting call site) turns this check red.
 *
 * TWO checks:
 *  (A) Literal call sites — any non-test backend .ts file that posts a MONITORED source type via a
 *      literal `source_transaction_type: "<type>"` must contain BOTH a gate (`isEnabled(` or a known
 *      per-entity gate-resolver helper) AND the matching posting flag token (the flag string literal or
 *      its `*_FLAG_KEY` constant). This covers the maintenance-bill poster, recurring-bill generator,
 *      customer-payment apply path, the expense/bill/bill-payment/bank-feed posters, etc.
 *  (B) The generic MVP posting route (posting-engine.routes.ts) posts a DYNAMIC source type (from the
 *      request body), so a literal scan can't see it. Enforce that it references `isEnabled(` AND the
 *      posting flag for every source type it can post (bill / bill_payment / customer_payment / invoice).
 *
 * SCOPE NOTE — `driver_advance` is intentionally NOT monitored here. Its posting flag
 * (BANK_DRIVER_ADVANCE_ENABLED) is enforced at the bank-categorization / cash-advance-request layer, not
 * inside the shared disburse core (cash-advances/cash-advance-disburse.ts). Gating that shared core is a
 * separate item; adding it to this guard would flag a pre-existing, out-of-scope path.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = "apps/backend/src";
const errors = [];

// source type -> accepted flag tokens (flag string literal OR its *_FLAG_KEY constant name OR a known
// per-entity gate-resolver helper). A file gating this type must reference at least one of these.
const MONITORED = {
  expense: ["EXPENSE_GL_POSTING_ENABLED", "EXPENSE_GL_POSTING_FLAG_KEY"],
  bill: ["BILL_GL_POSTING_ENABLED", "BILL_GL_POSTING_FLAG_KEY", "SETTLEMENT_GL_POSTING_ENABLED", "SETTLEMENT_GL_POSTING_FLAG_KEY"],
  bill_payment: [
    "BILL_PAYMENT_GL_POSTING_ENABLED",
    "BILL_PAYMENT_GL_POSTING_FLAG_KEY",
    "isBillPaymentGlPostingEnabled",
    "SETTLEMENT_GL_POSTING_ENABLED",
    "SETTLEMENT_GL_POSTING_FLAG_KEY",
  ],
  customer_payment: ["CUSTOMER_PAYMENT_GL_POSTING_ENABLED", "CUSTOMER_PAYMENT_GL_POSTING_FLAG_KEY"],
  invoice: ["INVOICE_AR_GL_POSTING_ENABLED", "INVOICE_AR_GL_POSTING_FLAG_KEY"],
  bank_categorization: ["BANK_FEED_GL_POSTING_ENABLED", "BANK_FEED_GL_POSTING_FLAG_KEY"],
};

// A "gate" is present if the file resolves a flag at all: the shared resolver `isEnabled(` or a known
// per-entity gate-resolver helper that wraps it.
const GATE_RESOLVERS = ["isEnabled(", "isBillPaymentGlPostingEnabled"];

// The generic MVP posting route posts a dynamic source type — enforce each of these flags in-file.
const MVP_ROUTE = path.join(SRC, "accounting/posting-engine.routes.ts");
const MVP_REQUIRED_FLAGS = [
  "INVOICE_AR_GL_POSTING_ENABLED",
  "BILL_GL_POSTING_ENABLED",
  "BILL_PAYMENT_GL_POSTING_ENABLED",
  "CUSTOMER_PAYMENT_GL_POSTING_ENABLED",
];

function walk(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const name of fs.readdirSync(abs)) {
    const rel = path.join(dir, name);
    const st = fs.statSync(path.join(ROOT, rel));
    if (st.isDirectory()) {
      if (name === "__tests__") continue;
      out.push(...walk(rel));
    } else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) {
      out.push(rel);
    }
  }
  return out;
}

const files = walk(SRC);

// ── (A) literal call sites ──────────────────────────────────────────────────────────────────────────
for (const rel of files) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (!src.includes("postSourceTransaction(")) continue;

  for (const [type, tokens] of Object.entries(MONITORED)) {
    const literal = new RegExp(`source_transaction_type:\\s*["']${type}["']`);
    if (!literal.test(src)) continue;

    const hasGate = GATE_RESOLVERS.some((g) => src.includes(g));
    const hasFlag = tokens.some((t) => src.includes(t));
    if (!hasGate || !hasFlag) {
      const missing = [];
      if (!hasGate) missing.push("no isEnabled()/gate-resolver call");
      if (!hasFlag) missing.push(`no posting flag token (${tokens.join(" | ")})`);
      errors.push(
        `${rel}: posts source_transaction_type "${type}" but is NOT gated by its per-entity kill switch — ${missing.join("; ")}.`
      );
    }
  }
}

// ── (B) generic MVP route (dynamic source type) ───────────────────────────────────────────────────────
if (!fs.existsSync(path.join(ROOT, MVP_ROUTE))) {
  errors.push(`${MVP_ROUTE}: generic MVP posting route not found — cannot verify its kill switch.`);
} else {
  const src = fs.readFileSync(path.join(ROOT, MVP_ROUTE), "utf8");
  if (!src.includes("isEnabled(")) {
    errors.push(`${MVP_ROUTE}: generic MVP post route must gate posting via isEnabled() — none found.`);
  }
  for (const flag of MVP_REQUIRED_FLAGS) {
    if (!src.includes(flag)) {
      errors.push(
        `${MVP_ROUTE}: generic MVP post route posts a dynamic source type but does not enforce ${flag} — every source type it can post must be flag-gated (kill-switch parity).`
      );
    }
  }
}

if (errors.length > 0) {
  console.error("verify-all-posting-paths-gated: FAIL — unflagged GL-posting path(s) found:\n");
  for (const e of errors) console.error("  - " + e);
  console.error(
    "\nEvery postSourceTransaction() call site must honor its per-entity posting flag via isEnabled(). " +
      "Gate the path (default OFF) before merging."
  );
  process.exit(1);
}

console.log("verify-all-posting-paths-gated: OK — all monitored GL-posting paths are gated by their per-entity kill switch.");
