#!/usr/bin/env node
/**
 * LOAD-CLOSE-LIFECYCLE guard (owner ruling 2026-09-09: "THOSE DELIVERED SHOULD ALREADY HAVE BEEN
 * CLOSED IN THE APP"). Pins the delivered→invoiced→closed auto-progression so it can never silently
 * regress or drift from the canonical transition map:
 *
 *   1. The service (dispatch/load-billing-lifecycle.service.ts) closes a load ONLY when its invoice is
 *      paid or its factoring purchase is funded/collected/released, and advances to `invoiced` when
 *      the invoice is sent.
 *   2. Every FORWARD_STEP the service takes exists in loads.routes.ts `allowedStatusTransitions` — it
 *      can only walk the load along steps the canonical state machine already allows.
 *   3. It walks FORWARD only (no backward step; delivered_pending_docs never jumps straight to
 *      `closed` — it must pass through `invoiced`).
 *   4. It NEVER posts a journal entry (no postFactoringAdvanceEvent / poster call) — status-only.
 *   5. The delivery latch enqueues the billing sync; the factoring `/advance` route closes the load
 *      after it funds.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SERVICE = path.join(ROOT, "apps/backend/src/dispatch/load-billing-lifecycle.service.ts");
const LATCH = path.join(ROOT, "apps/backend/src/dispatch/delivery-evidence-latch.ts");
const ADVANCE = path.join(ROOT, "apps/backend/src/accounting/factoring-advances.routes.ts");
const LOADS_ROUTES = path.join(ROOT, "apps/backend/src/mdata/loads.routes.ts");

const BILLING_TAIL_ORDER = [
  "delivered",
  "delivered_pending_docs",
  "completed_docs_received",
  "invoiced",
  "paid",
  "closed",
];

function read(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

export function parseAllowedTransitions(src) {
  const start = src.indexOf("allowedStatusTransitions");
  if (start < 0) return {};
  const brace = src.indexOf("{", start);
  const end = src.indexOf("};", brace);
  const block = src.slice(brace + 1, end);
  const map = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^\s*([a-z_]+)\s*:\s*\[([^\]]*)\]/);
    if (!m) continue;
    const from = m[1];
    const tos = m[2]
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
    map[from] = tos;
  }
  return map;
}

export function parseForwardSteps(src) {
  const start = src.indexOf("FORWARD_STEP");
  if (start < 0) return [];
  const brace = src.indexOf("{", start);
  const end = src.indexOf("}", brace);
  const block = src.slice(brace + 1, end);
  const pairs = [];
  for (const line of block.split("\n")) {
    const m = line.match(/^\s*([a-z_]+)\s*:\s*["']([a-z_]+)["']/);
    if (m) pairs.push([m[1], m[2]]);
  }
  return pairs;
}

export function check(sources) {
  const { service, latch, advance, allowed } = sources;
  const problems = [];

  if (!service) {
    problems.push("missing dispatch/load-billing-lifecycle.service.ts");
    return problems;
  }

  if (!/LOAD_CLOSE_INVOICE_STATUSES[\s\S]*?["']paid["']/.test(service)) {
    problems.push("service must close a load when its invoice is 'paid' (LOAD_CLOSE_INVOICE_STATUSES)");
  }
  for (const st of ["advanced", "collected", "released"]) {
    if (!new RegExp(`LOAD_CLOSE_FACTORING_STATUSES[\\s\\S]*?["']${st}["']`).test(service)) {
      problems.push(`service must close a load when factoring_status is '${st}'`);
    }
  }
  if (!/invoiceStatus === "sent"[\s\S]*?"invoiced"/.test(service)) {
    problems.push("service must advance a load to 'invoiced' when its invoice is 'sent'");
  }

  const steps = parseForwardSteps(service);
  if (steps.length === 0) problems.push("could not parse FORWARD_STEP from the service");
  for (const [from, to] of steps) {
    const tos = allowed[from] || [];
    if (!tos.includes(to)) {
      problems.push(`FORWARD_STEP ${from}->${to} is NOT in loads.routes.ts allowedStatusTransitions (drift)`);
    }
    if (BILLING_TAIL_ORDER.indexOf(to) <= BILLING_TAIL_ORDER.indexOf(from)) {
      problems.push(`FORWARD_STEP ${from}->${to} is not a forward move`);
    }
  }
  if (steps.some(([from, to]) => from === "delivered_pending_docs" && to === "closed")) {
    problems.push("delivered_pending_docs must not jump straight to closed — it must pass through invoiced");
  }

  if (/postFactoringAdvanceEvent\s*\(|postLoadRevenue|postJournalEntry\s*\(/.test(service)) {
    problems.push("load-close service must be status-only — it must NEVER call a GL poster");
  }

  if (!/load-billing-sync/.test(latch) || !/syncLoadStatusToBilling/.test(latch)) {
    problems.push("delivery latch must enqueue the load billing sync (syncLoadStatusToBilling)");
  }
  if (!/syncLoadsForFactoringAdvance/.test(advance)) {
    problems.push("factoring /advance route must call syncLoadsForFactoringAdvance to close funded loads");
  }

  return problems;
}

export function selftest() {
  const goodAllowed = parseAllowedTransitions(
    `const allowedStatusTransitions = {
      delivered: ["delivered_pending_docs", "completed_docs_received", "invoiced", "cancelled"],
      delivered_pending_docs: ["completed_docs_received", "invoiced", "cancelled"],
      completed_docs_received: ["invoiced", "closed"],
      invoiced: ["paid", "closed"],
      paid: ["closed"],
      closed: [],
    };`
  );
  const goodService = `
    export const LOAD_CLOSE_INVOICE_STATUSES = ["paid"] as const;
    export const LOAD_CLOSE_FACTORING_STATUSES = ["advanced", "collected", "released"] as const;
    const FORWARD_STEP = {
      delivered: "invoiced",
      delivered_pending_docs: "invoiced",
      completed_docs_received: "invoiced",
      invoiced: "closed",
      paid: "closed",
    };
    if (invoiceStatus === "sent") { target = "invoiced"; }
  `;
  const goodLatch = `label: \`load-billing-sync:\${input.loadId}\`, run: () => fireLoadBillingSync(input) ... syncLoadStatusToBilling`;
  const goodAdvance = `await syncLoadsForFactoringAdvance({ });`;
  const pass = check({ service: goodService, latch: goodLatch, advance: goodAdvance, allowed: goodAllowed });
  if (pass.length) throw new Error("selftest good-case failed: " + pass.join("; "));

  const badJump = goodService.replace('delivered_pending_docs: "invoiced"', 'delivered_pending_docs: "closed"');
  const failJump = check({ service: badJump, latch: goodLatch, advance: goodAdvance, allowed: goodAllowed });
  if (!failJump.some((p) => /pass through invoiced|forward move|allowedStatusTransitions/.test(p))) {
    throw new Error("selftest failed to catch delivered_pending_docs->closed jump");
  }

  const badPost = goodService + "\npostFactoringAdvanceEvent({});";
  const failPost = check({ service: badPost, latch: goodLatch, advance: goodAdvance, allowed: goodAllowed });
  if (!failPost.some((p) => /status-only/.test(p))) {
    throw new Error("selftest failed to catch GL poster call in load-close service");
  }

  const failLatch = check({ service: goodService, latch: "nothing", advance: goodAdvance, allowed: goodAllowed });
  if (!failLatch.some((p) => /delivery latch must enqueue/.test(p))) {
    throw new Error("selftest failed to catch unwired latch");
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    console.log("verify-load-close-lifecycle-wired: selftest OK");
    return;
  }
  const problems = check({
    service: read(SERVICE),
    latch: read(LATCH),
    advance: read(ADVANCE),
    allowed: parseAllowedTransitions(read(LOADS_ROUTES)),
  });
  if (problems.length) {
    console.error("verify-load-close-lifecycle-wired FAILED:");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log("verify-load-close-lifecycle-wired: OK");
}

main();
