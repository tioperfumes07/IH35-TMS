#!/usr/bin/env node
/**
 * LV-SETTLEMENT-DETAIL-CALLS-REFUSED-ROUTE — a settlement must never assert "no payments" when the fetch
 * failed.
 *
 * `SettlementDetailPage` queried `payment-events` with NO error branch. A failed fetch left `data`
 * undefined, fell through to `length === 0`, and the panel rendered "No payment events yet." — stating as
 * FACT that no payments occurred on a MONEY document, when the truth was that the data was never
 * obtainable. The settlement-payment routes are now mounted (index.ts); the defect was the silent
 * false-negative empty state, and this guard still ratchets the ERROR-before-empty ordering so a
 * transient 5xx never looks like “no payments”.
 *
 * SETTLE-PAY-FE-COMPANY-ID (same surface): backend `parseCompanyQuery` requires
 * `operating_company_id` on every driver-pay mutation. FE helpers that omit `?${q(companyId)}`
 * 400 validation_error — Mark Paid / Queue can never succeed. Ratchet those URL builders here.
 *
 * This guard asserts the ERROR branch exists and is checked BEFORE the empty-state branch — the ordering is
 * the whole fix, since `isError` and `length === 0` are both true on a failed fetch.
 *
 *   node scripts/verify-settlement-payment-events-honest.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-settlement-payment-events-honest";
const PAGE = "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx";
const API = "apps/frontend/src/api/driverFinance.ts";

const PAY_MUTATIONS = [
  "queue-payment",
  "mark-sent",
  "mark-cleared",
  "mark-bounced",
  "mark-paid-manually",
];

function assert(files) {
  const src = files[PAGE] ?? "";
  const api = files[API] ?? "";
  const problems = [];
  const errIdx = src.indexOf("paymentEventsQuery.isError");
  // Anchor on the JSX, not the phrase: this file's own explanatory comment quotes the empty-state text,
  // and matching that made the guard fail its own correct code by comparing against the comment's index.
  const emptyIdx = src.indexOf('<p className="text-xs text-gray-500">No payment events yet.</p>');
  if (errIdx < 0) {
    problems.push(`${PAGE}: paymentEventsQuery needs an isError branch — without it a failed fetch renders "No payment events yet."`);
  }
  if (emptyIdx >= 0 && errIdx >= 0 && errIdx > emptyIdx) {
    problems.push(`${PAGE}: the isError branch must be checked BEFORE the empty state — both are true on a failed fetch`);
  }

  for (const slug of PAY_MUTATIONS) {
    // Source uses template literals; match the unescaped form in file text.
    const liveNeedle = "`/api/v1/driver-pay/settlements/${id}/" + slug + "?${q(companyId)}`";
    if (!api.includes(liveNeedle)) {
      problems.push(
        `${API}: ${slug} must append ?\${q(companyId)} — routes parseCompanyQuery 400 without operating_company_id`
      );
    }
  }
  if (!src.includes("queueSettlementPayment(settlementId, companyId)")) {
    problems.push(`${PAGE}: queueSettlementPayment must pass companyId`);
  }
  if (!src.includes("markSettlementPaidManually(settlementId, companyId,")) {
    problems.push(`${PAGE}: markSettlementPaidManually must pass companyId`);
  }
  if (!src.includes("markSettlementSent(settlementId, companyId,")) {
    problems.push(`${PAGE}: markSettlementSent must pass companyId`);
  }
  if (!src.includes("markSettlementCleared(settlementId, companyId)")) {
    problems.push(`${PAGE}: markSettlementCleared must pass companyId`);
  }
  if (!src.includes("markSettlementBounced(settlementId, companyId,")) {
    problems.push(`${PAGE}: markSettlementBounced must pass companyId`);
  }

  return problems;
}

const files = Object.fromEntries(
  [PAGE, API].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")])
);

if (SELFTEST) {
  const checks = [
    ["error branch removed", { ...files, [PAGE]: files[PAGE].replace(/paymentEventsQuery\.isError/g, "false && x_removed") }],
    [
      "pay URL drops companyId",
      {
        ...files,
        [API]: files[API].replaceAll("?${q(companyId)}", ""),
      },
    ],
  ];
  for (const [name, planted] of checks) {
    if (!assert(planted).length) {
      console.error(`${LABEL} SELFTEST FAIL — planted "${name}" was not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} planted breaks caught`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(
  `${LABEL}: OK — payment-events error-before-empty + driver-pay mutations carry operating_company_id`
);
process.exit(0);
