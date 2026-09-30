#!/usr/bin/env node
/**
 * GUARD: the invoice SEND path must refuse a load that has not delivered and has no recorded
 * manual delivery authorization.
 *
 * WHY THIS EXISTS: the detection half of this rule already shipped 2026-09-30 as
 * verify-issued-invoice-on-rolling-load-needs-authorization.mjs, and was never wired. Detection
 * after the fact is not a fix -- by the time it reports, a real document has reached a real
 * customer and, on IH35's recourse line, been factored at Faro. Measured live the same day:
 * dispatch.manual_delivery_authorizations held 0 rows across ALL companies while loads 13625 and
 * 13626 carried SENT invoices with $6,062.50 and $3,298.00 advanced against them.
 *
 * Owner, verbatim: "unless we have approval from the customer, we already have this engine, factor
 * but not delivered."
 *
 * This guard asserts the WRITE BLOCK is present and still reads the right things -- the load's own
 * status, an ACTIVE (revoked_at IS NULL) authorization, and a refusal rather than a warning.
 *
 * Usage:  node scripts/verify-invoice-send-blocks-rolling-load.mjs
 *         node scripts/verify-invoice-send-blocks-rolling-load.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-invoice-send-blocks-rolling-load";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEND = "apps/backend/src/accounting/invoice-send.service.ts";
const GUARDS = "apps/backend/src/accounting/invoice-linkage-guards.ts";

export function assertSendBlocksRollingLoad(send, guards) {
  const problems = [];

  // --- the rule itself ---
  if (!/export const PRE_DELIVERY_LOAD_STATUSES/.test(guards)) {
    problems.push(`${GUARDS}: PRE_DELIVERY_LOAD_STATUSES is gone -- the rule has nothing to test a load against.`);
  } else {
    for (const st of ["dispatched", "at_pickup", "in_transit", "at_delivery"]) {
      if (!new RegExp(`"${st}"`).test(guards.slice(guards.indexOf("PRE_DELIVERY_LOAD_STATUSES")))) {
        problems.push(`${GUARDS}: PRE_DELIVERY_LOAD_STATUSES no longer includes "${st}", so an invoice can be issued on a load in that state.`);
      }
    }
  }
  if (!/export function issuedInvoiceNeedsDeliveryAuthorization/.test(guards)) {
    problems.push(`${GUARDS}: issuedInvoiceNeedsDeliveryAuthorization is gone.`);
  }
  if (!/export function assertIssuedInvoiceAuthorizedIfRolling/.test(guards)) {
    problems.push(`${GUARDS}: assertIssuedInvoiceAuthorizedIfRolling is gone -- nothing throws.`);
  }

  // --- the write path actually calls it ---
  if (!/assertIssuedInvoiceAuthorizedIfRolling\(/.test(send)) {
    problems.push(
      `${SEND}: sendDraftInvoice no longer calls assertIssuedInvoiceAuthorizedIfRolling. An invoice could again be ` +
        `issued and factored on freight that is still rolling, with no customer approval on record.`
    );
  }
  if (!/dispatch\.manual_delivery_authorizations/.test(send)) {
    problems.push(`${SEND}: the send path no longer reads dispatch.manual_delivery_authorizations -- it cannot know whether approval exists.`);
  }
  if (!/revoked_at IS NULL/.test(send)) {
    problems.push(
      `${SEND}: the authorization lookup does not filter on \`revoked_at IS NULL\`. A REVOKED approval would ` +
        `satisfy the check, which is worse than no check -- it would look authorized.`
    );
  }
  if (!/FROM mdata\.loads l/.test(send)) {
    problems.push(`${SEND}: the send path no longer reads the load's own status from mdata.loads.`);
  }
  if (!/invoice_on_rolling_load_needs_authorization/.test(send)) {
    problems.push(`${SEND}: the refusal no longer returns the named error invoice_on_rolling_load_needs_authorization.`);
  }
  // It must REFUSE, not warn. A 2xx here means the document went out anyway.
  const refusal = send.match(/error: "invoice_on_rolling_load_needs_authorization"[\s\S]{0,200}/);
  const codeNear = send.match(/code: (\d{3}),\s*\n\s*error: "invoice_on_rolling_load_needs_authorization"/);
  if (refusal && (!codeNear || !/^4|^5/.test(codeNear[1]))) {
    problems.push(`${SEND}: the rolling-load refusal does not return a 4xx/5xx status -- the invoice would still be sent.`);
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const send = fs.readFileSync(path.join(ROOT, SEND), "utf8");
  const guards = fs.readFileSync(path.join(ROOT, GUARDS), "utf8");
  const expect = (name, s, g, needle) => {
    const problems = assertSendBlocksRollingLoad(s, g);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: planted defect NOT caught (got: ${problems.join(" | ") || "no problems"})`);
    }
  };

  const live = assertSendBlocksRollingLoad(send, guards);
  if (live.length) failures.push(`live-file: ${live.join(" | ")}`);

  // 1. THE REGRESSION -- the call is removed from the send path (the pre-2026-09-30 state).
  expect("call-removed", send.replace(/assertIssuedInvoiceAuthorizedIfRolling\(/g, "noop("), guards, "no longer calls");
  // 2. A revoked authorization would pass.
  expect("revoked-accepted", send.replace(/AND mda\.revoked_at IS NULL/, ""), guards, "revoked_at IS NULL");
  // 3. The refusal becomes a warning.
  expect("refusal-downgraded", send.replace(/code: 409,\n            error: "invoice_on_rolling_load_needs_authorization"/, 'code: 200,\n            error: "invoice_on_rolling_load_needs_authorization"'), guards, "does not return a 4xx");
  // 4. A pre-delivery status is quietly dropped from the rule.
  expect("status-dropped", send, guards.replace(/"in_transit", /, ""), 'no longer includes "in_transit"');
  // 5. The thrower is deleted.
  expect("assert-deleted", send, guards.replace(/export function assertIssuedInvoiceAuthorizedIfRolling/, "function assertIssuedInvoiceAuthorizedIfRolling"), "is gone -- nothing throws");
  // 6. The authorization table is no longer consulted at all.
  expect("table-not-read", send.replace(/dispatch\.manual_delivery_authorizations/g, "dispatch.some_other_table"), guards, "no longer reads dispatch.manual_delivery_authorizations");

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED (${failures.length})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} selftest 6/6 OK`);
  }
} else {
  const problems = assertSendBlocksRollingLoad(
    fs.readFileSync(path.join(ROOT, SEND), "utf8"),
    fs.readFileSync(path.join(ROOT, GUARDS), "utf8")
  );
  if (problems.length) {
    console.error(`${LABEL} FAILED (${problems.length})`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
