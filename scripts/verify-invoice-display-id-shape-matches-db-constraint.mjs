#!/usr/bin/env node
/**
 * verify-invoice-display-id-shape-matches-db-constraint.mjs
 *
 * SET-25 (owner order 2026-09-04). The owner could not create an invoice on his first real load:
 * from-load.ts writes the load's plain-digit load_number straight into accounting.invoices.
 * display_id, but the live invoices_display_id_check constraint only accepted the two dead
 * YYYYMMDD-prefixed formats plus INV-YYYY-NNNNN -- never plain digits. The DB constraint was the
 * FIRST (and only) line of defense; app code never validated a shape at all.
 *
 * This guard is a regression lock, not a live-DB check (CI guards run with no reachable
 * Postgres). The live constraint definition below was captured via a real
 * `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='invoices_display_id_check'`
 * against Neon prod tiny-field-89581227 on 2026-09-04, immediately after migration 202613650001
 * applied, run twice, identical both times -- pasted verbatim, not retyped from memory. If the
 * live constraint is ever changed by a future migration without updating this string, this guard
 * will keep passing on a STALE definition; that is an accepted limitation of the frozen-snapshot
 * pattern already used elsewhere in this repo (canonical-relations.json), not unique to this file.
 */
import { readFileSync } from "node:fs";

const DISPLAY_ID_PATH = "apps/backend/src/accounting/display-id.ts";

// Captured live, verbatim, 2026-09-04 (see header). The four alternatives, in the SAME order
// pg_get_constraintdef returned them.
const LIVE_DB_CONSTRAINT_ALTERNATIVES = [
  "^INV-[0-9]{4}-[0-9]{5}$",
  "^L-[0-9]{8}-[0-9]{4}$",
  "^LUSMCAFREIGHT-[0-9]{8}-[0-9]{4}$",
  "^[0-9]{1,12}$",
];
const LIVE_DB_CONSTRAINT_PATTERN = new RegExp(
  `^(${LIVE_DB_CONSTRAINT_ALTERNATIVES.map((p) => p.slice(1, -1)).join("|")})$`
);

const TEST_VALUES = [
  // Must be ACCEPTED by both the DB constraint and the code-side validator.
  { value: "INV-2026-00001", expectAccepted: true },
  { value: "L-20260615-0001", expectAccepted: true },
  { value: "LUSMCAFREIGHT-20260615-0001", expectAccepted: true },
  { value: "13508", expectAccepted: true }, // the exact load that was blocked
  { value: "1", expectAccepted: true },
  { value: "123456789012", expectAccepted: true }, // 12 digits, the max
  // Must be REJECTED by both.
  { value: "1234567890123", expectAccepted: false }, // 13 digits, over the max
  { value: "INV-26-1", expectAccepted: false },
  { value: "hello-123", expectAccepted: false },
  { value: "", expectAccepted: false },
  { value: "13508 ", expectAccepted: false }, // trailing space
];

function loadSource() {
  return readFileSync(DISPLAY_ID_PATH, "utf8");
}

/** Extracts INVOICE_DISPLAY_ID_PATTERN's literal regex source out of display-id.ts, so this guard
 * tests the ACTUAL exported constant's text, not a re-typed copy that could silently drift from it. */
function extractCodePattern(src) {
  const m = src.match(/export const INVOICE_DISPLAY_ID_PATTERN =\s*\n?\s*(\/\^.*\$\/);/);
  if (!m) return null;
  // eslint-disable-next-line no-eval -- reading our own source's regex literal back into a RegExp, not user input.
  return eval(m[1]);
}

export function collectFailures(src = loadSource()) {
  const failures = [];
  const codePattern = extractCodePattern(src);
  if (!codePattern) {
    failures.push("could not find/parse INVOICE_DISPLAY_ID_PATTERN in display-id.ts");
    return failures;
  }

  for (const { value, expectAccepted } of TEST_VALUES) {
    const dbAccepts = LIVE_DB_CONSTRAINT_PATTERN.test(value);
    const codeAccepts = codePattern.test(value);
    if (dbAccepts !== expectAccepted) {
      failures.push(`fixture bug: DB constraint pattern ${dbAccepts ? "accepts" : "rejects"} "${value}", expected ${expectAccepted}`);
    }
    if (codeAccepts !== expectAccepted) {
      failures.push(`INVOICE_DISPLAY_ID_PATTERN ${codeAccepts ? "accepts" : "rejects"} "${value}", expected ${expectAccepted}`);
    }
    if (dbAccepts !== codeAccepts) {
      failures.push(`DISAGREEMENT on "${value}": DB constraint ${dbAccepts ? "accepts" : "rejects"}, code validator ${codeAccepts ? "accepts" : "rejects"}`);
    }
  }

  if (!/export class InvalidDisplayIdShapeError/.test(src)) {
    failures.push("InvalidDisplayIdShapeError is missing -- a shape mismatch would fall through to a raw, unhandled Postgres error again");
  }
  if (!/assertDisplayIdShape\(manual, INVOICE_DISPLAY_ID_PATTERN, "invoice"\)/.test(src)) {
    failures.push("resolveInvoiceDisplayId's manual path does not validate against INVOICE_DISPLAY_ID_PATTERN");
  }
  if (!/assertDisplayIdShape\(fallback, INVOICE_DISPLAY_ID_PATTERN, "invoice"\)/.test(src)) {
    failures.push("resolveInvoiceDisplayId's autoFallback path (the exact path from-load.ts's load_number write uses) does not validate against INVOICE_DISPLAY_ID_PATTERN");
  }
  if (!/assertDisplayIdShape\(manual, PAYMENT_DISPLAY_ID_PATTERN, "payment"\)/.test(src)) {
    failures.push("resolvePaymentDisplayId's manual path does not validate its shape -- the same hole, unfixed");
  }
  if (!/assertDisplayIdShape\(manual, BILL_DISPLAY_ID_PATTERN, "bill"\)/.test(src)) {
    failures.push("resolveBillDisplayId's manual path does not validate its shape -- the same hole, unfixed");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-invoice-display-id-shape-matches-db-constraint SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const src = loadSource();
  const mutations = [
    [
      "plain-digits alternative dropped from the code pattern (reintroduces the exact bug this PR fixes)",
      "INV-[0-9]{4}-[0-9]{5}|L-[0-9]{8}-[0-9]{4}|LUSMCAFREIGHT-[0-9]{8}-[0-9]{4}|[0-9]{1,12}",
      "INV-[0-9]{4}-[0-9]{5}|L-[0-9]{8}-[0-9]{4}|LUSMCAFREIGHT-[0-9]{8}-[0-9]{4}",
    ],
    [
      "invoice manual-path validation call removed",
      'assertDisplayIdShape(manual, INVOICE_DISPLAY_ID_PATTERN, "invoice");\n    await withDisplayLock(client, `accounting.invoice.display_id:${operatingCompanyId}`);',
      "await withDisplayLock(client, `accounting.invoice.display_id:${operatingCompanyId}`);",
    ],
    [
      "payment manual-path validation call removed",
      'assertDisplayIdShape(manual, PAYMENT_DISPLAY_ID_PATTERN, "payment");\n    await withDisplayLock(client, `accounting.payment.display_id:${operatingCompanyId}`);',
      "await withDisplayLock(client, `accounting.payment.display_id:${operatingCompanyId}`);",
    ],
  ];
  const escaped = [];
  for (const [name, from, to] of mutations) {
    if (!src.includes(from)) {
      escaped.push(`${name} (plant target not found -- source drifted)`);
      continue;
    }
    const planted = src.replace(from, to);
    if (planted === src || collectFailures(planted).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-invoice-display-id-shape-matches-db-constraint SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-invoice-display-id-shape-matches-db-constraint SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("verify-invoice-display-id-shape-matches-db-constraint: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "verify-invoice-display-id-shape-matches-db-constraint: OK — INVOICE_DISPLAY_ID_PATTERN agrees with the live invoices_display_id_check constraint on every test value, plain digits (the load_number shape) accepted, and manual/auto paths on invoice/payment/bill all validate shape before returning"
);
