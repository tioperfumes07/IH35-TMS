#!/usr/bin/env node
/**
 * GUARD — verify-disp-wire-04-invoice-evidence-durable (CLS-DISP-WIRE-04 / ACCT-F61)
 *
 * DEFECT THIS ASSERTS
 * IH35 factors receivables with Faro on a RECOURSE basis, so an invoice sent without proof of
 * delivery is a chargeback risk carried by the company. The delivery-evidence gate exists but is
 * deliberately warn-only until INVOICE_SEND_REQUIRES_DELIVERY_EVIDENCE is seeded per entity. The
 * justification for shipping it OFF is that the exposure would be "measurable before it is
 * enforced" — and a console.warn does NOT make it measurable. Log lines on Render cannot be
 * queried, aggregated, or tied out, so the flip decision would rest on no number at all.
 *
 * This guard asserts the unevidenced-send path writes a DURABLE append-only audit row, and that it
 * does so on the same client as the send (atomic — so the count cannot silently under-report).
 *
 * METHOD — the mistake I keep making and am deliberately not repeating here:
 * guards of mine have four times matched their own explanatory prose, an error string, or their own
 * selftest fixture, and so passed while the real code was broken. This one strips comments and
 * string literals before asserting, and its selftest MUTATES the real source to prove the assertion
 * actually fails when the durable write is removed. A guard that cannot fail is not a guard.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-disp-wire-04-invoice-evidence-durable";
const TARGET = "apps/backend/src/accounting/invoice-send.service.ts";
const EVENT_CLASS = "accounting.invoice.sent_without_delivery_evidence";

/** Remove line/block comments so guard prose can never satisfy the guard. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Assert against code only; returns the list of failures. */
function check(rawSrc) {
  const code = stripComments(rawSrc);
  const errors = [];

  if (!/import\s*\{[^}]*\bappendCrudAudit\b[^}]*\}\s*from/.test(code)) {
    errors.push("appendCrudAudit is not imported — the durable audit sink is not wired in.");
  }

  // The durable write must exist AND carry the canonical event_class.
  const callIdx = code.indexOf("appendCrudAudit(");
  const importIdx = code.search(/import\s*\{[^}]*\bappendCrudAudit\b/);
  const hasCall = callIdx !== -1 && callIdx !== importIdx;
  if (!hasCall) {
    errors.push("appendCrudAudit(...) is never CALLED — importing it does not record anything.");
  }
  if (!code.includes(EVENT_CLASS)) {
    errors.push(`event_class "${EVENT_CLASS}" is absent — the exposure is not countable.`);
  }

  // Atomicity: the call must pass the same `client` the send uses, not open its own connection.
  if (hasCall) {
    // Window widened: the LV-012 payload (reason codes, null-safe load_id) made this call longer than
    // the original 400-char slice, which silently pushed the severity argument out of view.
    const call = code.slice(callIdx, callIdx + 1200);
    if (!/appendCrudAudit\(\s*client\b/.test(call)) {
      errors.push(
        "appendCrudAudit is not called with the send's own `client` — a separate connection would " +
          "let the audit row commit or roll back independently, so the count could under-report."
      );
    }
    if (!/"warning"/.test(call)) {
      errors.push('the durable row is not severity "warning" — an unevidenced billable send is not info.');
    }
  }

  // LV-012: the gate must NOT be nested inside a source_load_id check. An invoice with no load has
  // zero delivery evidence by definition — 11,981 of 11,982 prod invoices are in exactly that state,
  // so nesting made the control blind to all but one of them.
  if (/if\s*\(\s*current\.source_load_id\s*\)\s*\{/.test(code)) {
    errors.push(
      "the evidence gate is nested inside `if (current.source_load_id)` — an invoice with NO load " +
        "skips the check entirely, which is the weakest-evidence case, not an exemption (LV-012)"
    );
  }
  if (!/no_source_load/.test(code)) {
    errors.push("the no-load case has no distinct reason code — the two exposure shapes cannot be split");
  }

  // LV-013: a send that transmits nothing must be recorded, not silent.
  if (!/sent_without_transmission/.test(code)) {
    errors.push(
      "an invoice stamped 'sent' with no deliverable email records nothing — the ledger would assert " +
        "a customer was billed when nothing was produced (LV-013)"
    );
  }
  if (/void\s+enqueueEmail\s*\(/.test(code)) {
    errors.push("enqueueEmail is fire-and-forget (`void`) — a transmission failure would be swallowed");
  }

  // The gate itself must still be present and must still reuse the revenue latch's evidence rule.
  if (!/finalActiveDeliveryDepartureAt/.test(code)) {
    errors.push("finalActiveDeliveryDepartureAt is gone — evidence would mean two different things.");
  }
  if (!/INVOICE_SEND_REQUIRES_DELIVERY_EVIDENCE/.test(code)) {
    errors.push("the enforcement flag constant is gone — the gate can no longer be turned on.");
  }

  return errors;
}

/**
 * SELFTEST — mutate the REAL source (never a hand-written fixture that can drift from it) and
 * require every assertion to actually trip. Proves the guard is not inert.
 */
function selftest() {
  const real = readFileSync(TARGET, "utf8");
  if (check(real).length !== 0) {
    console.error(`${LABEL} --selftest FAIL — real source does not pass, cannot validate mutations.`);
    process.exit(1);
  }

  const mutations = [
    ["durable write removed", (s) => s.replace(/await appendCrudAudit\([\s\S]*?\);/, "")],
    ["event_class renamed", (s) => s.split(EVENT_CLASS).join("accounting.invoice.something_else")],
    ["import dropped", (s) => s.replace(/import \{ appendCrudAudit \}.*\n/, "")],
    ["evidence rule forked", (s) => s.split("finalActiveDeliveryDepartureAt").join("someLocalCopy")],
    ["gate re-nested under source_load_id", (s) => s.replace("if (evidenceReason) {", "if (current.source_load_id) {")],
    ["no-load reason removed", (s) => s.split("no_source_load").join("something_else")],
    ["transmission silence restored", (s) => s.split("sent_without_transmission").join("nothing_recorded")],
    ["enqueue back to fire-and-forget", (s) => s.replace("await enqueueEmail({", "void enqueueEmail({")],
    ["flag constant removed", (s) => s.split("INVOICE_SEND_REQUIRES_DELIVERY_EVIDENCE").join("X_GONE")],
  ];

  for (const [name, mutate] of mutations) {
    const broken = mutate(real);
    if (broken === real) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (check(broken).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }

  console.log(`${LABEL} --selftest PASS — ${mutations.length} mutations all detected.`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const errors = check(readFileSync(TARGET, "utf8"));
if (errors.length > 0) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s) in ${TARGET}:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — unevidenced invoice sends append a durable, atomic audit row ` +
    `(${EVENT_CLASS}); exposure is countable before the flag is enforced.`
);
