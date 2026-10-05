#!/usr/bin/env node
/**
 * verify-every-void-route-reverses — E15.6 guard #1 (DEVIN-A, 2026-09-23).
 *
 * Enumerates EVERY route with a /void or /cancel path across apps/backend/src route files
 * and asserts each reaches a reversal engine:
 *   void.service.ts:521         — postVoidReversal
 *   posting-engine.service.ts   — reversePostedSourceTransactionInClientTx
 *   journal-entries.service.ts  — voidJournalEntry (wraps postVoidReversal)
 *   settlement-bill-payment      — reverseSettlementBillPaymentInClientTx
 *
 * A route that voids without reversing is the defect class that cost this entire session.
 *
 * APPROACH: for each file containing a /void or /cancel route declaration, check that the
 * file also contains a call to a reversal engine or a known wrapper. A file that registers
 * a money /void route but has NO reversal engine call is the defect.
 *
 * STATIC — no database, runs in every CI context including fresh-DB.
 *
 * Self-test: node scripts/verify-every-void-route-reverses.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-every-void-route-reverses";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES_DIR = "apps/backend/src";

/** Reversal engine function names — the canonical primitives that post reversing JEs. */
const REVERSAL_ENGINES = [
  "postVoidReversal",
  "reversePostedSourceTransactionInClientTx",
  "voidJournalEntry",
  "reverseSettlementBillPaymentInClientTx",
];

/**
 * Known wrapper service functions that internally call a reversal engine.
 * A route handler calling one of these transitively reaches a reversal engine.
 */
const REVERSAL_WRAPPERS = [
  // work-orders/work-order-financial-settle.service.ts — reverses the WO's linked bill / expense via postVoidReversal
  // (moved out of work-orders.routes.ts, CC-2 2026-10-04); pinned by verify-wo-void-flag-gate.
  "settleWorkOrderFinancialLinkage",
  "voidBill",
  "voidBillInClientTx",
  "voidBillPayment",
  "voidBillPaymentInClientTx",
  "voidSettlementDeduction",
  "voidDriverPaymentMethod",
  "voidSplit",
  "voidTrailerInterchange",
  "cancelLoad",
  "cancelLoadInClientTx",
  "voidInvoiceInBulk",
  "voidBillPaymentInBulk",
  "voidBillInBulk",
  "voidInvoiceInClientTx",
  "reverseFactoringAdvanceEvent",
  "reverseJournalEntryNoFlip",
  // fuel/fuel-card-overage.service.ts — reverses a posted overage receivable via reverseJournalEntryNoFlip;
  // pinned by verify-fuel-overage-gallon-cap-per-unit (fails if the call is removed or a DELETE appears).
  "voidFuelCardOverage",
  // void-document.service.ts's voidDocument() dispatcher (R-154 check engine round) -- "NOT a new
  // reversal engine" per its own header, a thin per-type dispatch to the SAME engines already named
  // above (reversePostedSourceTransactionInClientTx for 'expense', postVoidReversal for 'invoice'/
  // 'prepaid_purchase'/'customer_payment', voidBillInClientTx/voidBillPaymentInClientTx for 'bill'/
  // 'bill_payment', reverseFactoringAdvanceEvent for 'factoring_advance', voidJournalEntry for
  // 'journal_entry'). Verified live in its own source before adding here, same standard as every
  // other name in this list.
  "voidDocument",
  // check-void.service.ts's voidCheck() (R-154 §6, checks.routes.ts's POST /:id/void) -- calls
  // voidDocument({type:'expense'}) internally, one call site, verified.
  "voidCheck",
  // ROUND 312 B-2 — bank-deposits.service.ts voidBankDeposit() posts reverse via
  // reversePostedSourceTransactionInClientTx(source_transaction_type:'bank_deposit').
  "voidBankDeposit",
  // R-191 universal unvoid — reinstateDocumentThenVoidReversal stamps reinstated_* then voids the
  // void's reversing JE via voidJournalEntry (Option-1). reinstateDocument is the in-tx half;
  // unvoidCheck is the G-16 check-specific path that does the same for expenses.payment_type=check.
  "reinstateDocumentThenVoidReversal",
  "reinstateDocument",
  "unvoidCheck",
  // ROUND 315 step 2 — factoring/purchase.service.ts voidPurchase() reverses the purchase's funding JE through
  // reverseFactoringAdvanceEventInClientTx (the factoring_advance engine named above) and stamps the advance via
  // stampDocumentVoided, one transaction. Verified in source (purchase.routes.ts POST /factoring/purchases/:id/void).
  "voidPurchase",
];

/** All function names that satisfy the reversal requirement. */
const ALL_REVERSAL_NAMES = [...REVERSAL_ENGINES, ...REVERSAL_WRAPPERS];

/**
 * Exempt route patterns — non-money void/cancel routes that don't need a reversal engine.
 * These are catalog/config, read-only, governance, or non-money document voids.
 */
const EXEMPT_ROUTES = [
  { pattern: /\/catalogs\/.*cancellation-reasons/, reason: "catalog CRUD" },
  { pattern: /\/catalogs\/void-cancel-reasons/, reason: "catalog CRUD" },
  { pattern: /\/fleet\/roster-integrity\/:id\/void/, reason: "roster data-quality finding (fleet.roster_findings: no amount, no ledger); void-not-delete with reason — the route file became scannable when it left roster-integrity.service.ts (CC-2 2026-10-04)" },
  { pattern: /\/fuel\/card-assignments\/:id\/void/, reason: "E-22 card -> truck registry (master data, no amount, no ledger); void-not-delete with reason" },
  { pattern: /\/catalogs\/payment-methods\/.*\/void/, reason: "catalog config void" },
  { pattern: /\/mdata\/vendors\/.*\/payment-methods\/.*\/void/, reason: "vendor payment method config" },
  { pattern: /\/driver-finance\/payment-methods\/.*\/void/, reason: "payment method catalog void" },
  { pattern: /\/audit\/reports\/void-reversal/, reason: "read-only report" },
  { pattern: /\/linkage\/void-tree/, reason: "read-only tree query" },
  { pattern: /\/dispatch\/cancellations-report/, reason: "read-only report" },
  { pattern: /\/dispatch\/cancellation-reasons/, reason: "read-only reason list" },
  { pattern: /\/dispatch\/load-cancellations(?!\/.*\/)/, reason: "list/analytics" },
  { pattern: /\/dispatch\/load-cancellations\/.*\/approve/, reason: "approval workflow" },
  { pattern: /\/governance\/void-cancel-requests/, reason: "governance approval workflow" },
  { pattern: /\/driver\/cash-advance-requests\/.*\/cancel/, reason: "request cancellation" },
  { pattern: /\/driver\/scheduler\/request\/.*\/cancel/, reason: "scheduler request cancellation" },
  { pattern: /\/daily-tasks\/.*\/cancel/, reason: "task cancellation" },
  { pattern: /\/safety\/scheduler\/temp-assignments\/.*\/cancel/, reason: "temp assignment cancellation" },
  { pattern: /\/maintenance\/parts\/.*\/void/, reason: "part record void — no GL" },
  { pattern: /\/maintenance\/vehicles\/.*\/void/, reason: "vehicle record void — no GL" },
  { pattern: /\/maintenance\/drivers\/.*\/void/, reason: "driver record void — no GL" },
  { pattern: /\/maintenance\/vendors\/.*\/void/, reason: "vendor record void — no GL" },
  { pattern: /\/maintenance\/parts-inventory\/purchases\/.*\/void/, reason: "stock reversal — bill voided separately" },
  { pattern: /\/safety\/incidents\/.*\/void/, reason: "incident record void — no GL" },
  { pattern: /\/safety\/accident-liabilities\/.*\/void/, reason: "liability record void — no GL" },
  { pattern: /\/safety\/internal-fines\/.*\/void/, reason: "fine record void — refuses if converted" },
  { pattern: /\/liabilities\/.*\/void/, reason: "liability record void — no GL" },
  { pattern: /\/mdata\/.*safety-events\/.*\/void/, reason: "safety event void — no GL" },
  { pattern: /\/mdata\/.*quality-events\/.*\/void/, reason: "quality event void — no GL" },
  { pattern: /\/identity\/.*safety-events\/.*\/void/, reason: "safety event void — no GL" },
  // Credit memos and vendor credits void applications, not GL postings — no direct JE to reverse
  { pattern: /\/accounting\/credit-memos\/.*\/void/, reason: "credit memo void — reverses applications, no direct GL" },
  { pattern: /\/accounting\/vendor-credits\/.*\/void/, reason: "vendor credit void — reverses applications, no direct GL" },
  // Dispute cancellation — workflow state, not a money document void
  { pattern: /\/accounting\/invoice-disputes\/.*\/cancel/, reason: "dispute cancellation — workflow state, not money" },
  // ROUND 288.2 — recon session void is status-only (open session → voided). No JE. Previously
  // masked because reverseJournalEntryNoFlip lived in the same file for the (now-deleted) silent
  // session unmatch writer; unmatch now proxies unmatchBankTransaction in recon-worklist.service.
  { pattern: /\/banking\/reconciliation\/:sessionId\/void/, reason: "reconciliation session status void — no GL; money unmatch is unmatchBankTransaction" },
];

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Find all .routes.ts files recursively. */
function findRouteFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findRouteFiles(full));
    } else if (entry.name.endsWith(".routes.ts")) {
      results.push(full);
    }
  }
  return results;
}

/** Extract all /void or /cancel route path strings from a file. Returns Set of path strings. */
function extractVoidCancelRoutePaths(src) {
  const code = stripComments(src);
  const paths = new Set();
  // Match route path strings containing void or cancel: "..." or '...' or `...`
  // Only match strings that look like API paths (start with /)
  const pathRegex = /["'`]((?:\/api\/[^"'`]*(?:void|cancel)[^"'`]*)|(?:(?:void|cancel)[^"'`]*\/[^"'`]*))["'`]/gi;
  // Simpler: find all quoted strings containing /void or /cancel that start with /
  const simpleRegex = /["'`](\/[^"'`]*(?:void|cancel)[^"'`]*)["'`]/gi;
  let match;
  while ((match = simpleRegex.exec(code)) !== null) {
    paths.add(match[1]);
  }
  return paths;
}

/** Check if a route path matches any exempt pattern. Returns the reason or null. */
function matchExempt(routePath) {
  for (const exempt of EXEMPT_ROUTES) {
    if (exempt.pattern.test(routePath)) return exempt.reason;
  }
  return null;
}

/** Check if source contains a call to any reversal engine or wrapper. */
function sourceHasReversalCall(src) {
  const code = stripComments(src);
  for (const name of ALL_REVERSAL_NAMES) {
    const regex = new RegExp(`\\b${name}\\s*\\(`);
    if (regex.test(code)) return name;
  }
  return null;
}

/** Main check: enumerate all void/cancel routes and assert each file reaches a reversal engine. */
export function checkAllRoutesReachReversal(routeFiles) {
  const violations = [];

  for (const file of routeFiles) {
    const rel = path.relative(ROOT, file);
    const src = fs.readFileSync(file, "utf8");
    const routePaths = extractVoidCancelRoutePaths(src);

    // Filter to non-exempt routes
    const moneyRoutes = [];
    for (const routePath of routePaths) {
      const exemptReason = matchExempt(routePath);
      if (!exemptReason) {
        moneyRoutes.push(routePath);
      }
    }

    if (moneyRoutes.length === 0) continue;

    // Check if the file contains a reversal engine call
    const reversalName = sourceHasReversalCall(src);
    if (!reversalName) {
      for (const routePath of moneyRoutes) {
        violations.push({
          file: rel,
          route: routePath,
          reason: "no reversal engine call found in file",
        });
      }
    }
  }

  return violations;
}

const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint && process.argv.includes("--selftest")) {
  // GOOD: file with a void route AND a reversal call
  const goodSrc = `
    app.post("/api/v1/accounting/invoices/:id/void", async (req, reply) => {
      const result = await postVoidReversal(client, { entityType: "invoice" });
    });
  `;
  const goodPaths = extractVoidCancelRoutePaths(goodSrc);
  if (goodPaths.size !== 1) fail(`selftest: good fixture should have 1 route, got ${goodPaths.size}`);
  if (!goodPaths.has("/api/v1/accounting/invoices/:id/void")) fail("selftest: good fixture route path mismatch");
  if (!sourceHasReversalCall(goodSrc)) fail("selftest: good fixture should have reversal call");

  // BAD: file with a void route but NO reversal call
  const badSrc = `
    app.post("/api/v1/accounting/invoices/:id/void", async (req, reply) => {
      await client.query("UPDATE accounting.invoices SET status='void'");
    });
  `;
  const badPaths = extractVoidCancelRoutePaths(badSrc);
  if (badPaths.size !== 1) fail(`selftest: bad fixture should have 1 route, got ${badPaths.size}`);
  if (sourceHasReversalCall(badSrc)) fail("selftest: bad fixture should NOT have reversal call");

  // EXEMPT: catalog route should be exempt
  if (!matchExempt("/api/v1/catalogs/load-cancellation-reasons")) fail("selftest: catalog reasons should be exempt");
  if (!matchExempt("/api/v1/catalogs/payment-methods/abc/void")) fail("selftest: catalog payment void should be exempt");
  if (!matchExempt("/api/v1/daily-tasks/123/cancel")) fail("selftest: daily task cancel should be exempt");
  if (matchExempt("/api/v1/accounting/invoices/123/void")) fail("selftest: invoice void should NOT be exempt");
  if (matchExempt("/api/v1/accounting/bills/123/void")) fail("selftest: bill void should NOT be exempt");

  // WRAPPER: voidBill wrapper should be detected
  if (!sourceHasReversalCall("await voidBill(opco, id, reason, uid);")) fail("selftest: voidBill wrapper should be detected");
  if (!sourceHasReversalCall("await cancelLoadInClientTx(client, actor, role, { id });")) fail("selftest: cancelLoadInClientTx wrapper should be detected");

  // COMMENT TRAP: reversal call in a comment should NOT count
  const commentTrap = `
    // TODO: call postVoidReversal here
    app.post("/api/v1/accounting/invoices/:id/void", async (req, reply) => {
      await client.query("UPDATE accounting.invoices SET status='void'");
    });
  `;
  if (sourceHasReversalCall(commentTrap)) fail("selftest: comment-trap should NOT detect reversal call in comment");

  console.log(`[${LABEL}] selftest: PASS — good/bad/exempt/wrapper/comment-trap fixtures all classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  const routeFiles = findRouteFiles(path.join(ROOT, ROUTES_DIR));
  const violations = checkAllRoutesReachReversal(routeFiles);

  if (violations.length > 0) {
    console.error(`[${LABEL}] FAIL — ${violations.length} void/cancel route(s) without reversal engine:`);
    for (const v of violations) {
      console.error(`  ${v.file}  ${v.route}  — ${v.reason}`);
    }
    console.error(`\nEvery money /void or /cancel route must reach a reversal engine (postVoidReversal, reversePostedSourceTransactionInClientTx, voidJournalEntry, reverseSettlementBillPaymentInClientTx) or a known wrapper. Non-money routes must be on the exempt list.`);
    process.exit(1);
  }

  const routeFilesCount = routeFiles.length;
  console.log(`[${LABEL}] OK — scanned ${routeFilesCount} route files, every money /void or /cancel route reaches a reversal engine (postVoidReversal · reversePostedSourceTransactionInClientTx · voidJournalEntry · reverseSettlementBillPaymentInClientTx) or a known wrapper. Non-money routes exempt.`);
  process.exit(0);
}
