#!/usr/bin/env node
// ACCT-F26048 / CRITICAL-AR-TIEOUT-POSTED-WITHOUT-POSTING (2026-09-07, live healthz
// ledger.ar_tieout + ledger.posted_without_posting BOTH RED, $27,722.41 variance): of the three
// status-mutating bulk invoice actions that can land an invoice on a real A/R status
// (set_status, mark_sent, mark_factored -- POSTABLE_INVOICE_STATUSES = sent/paid/factored),
// mark_factored's CASE'd status transition (draft -> sent) could carry a draft invoice straight
// into 'sent' without ever calling either poster. 10 real USMCA invoices reached status='sent'
// with zero accounting.journal_entry_postings rows this exact way. set_status and mark_sent
// already called both helpers correctly -- mark_factored was the one gap.
//
// This guard enumerates the CLASS (every action branch below that can set a postable status),
// not just the one instance that broke, so a FOURTH bulk action added later that mutates invoice
// status is caught by this same check if it forgets the poster calls too (guards-must-enumerate-
// their-own-class law).
//
// Static, not live: the two poster helpers (postInvoiceGlAndAudit, fireRevrecLatchOnInvoiceIssued)
// are themselves idempotent and internally gated (posting flag, ACCT-F59/ACCT-F205 interlocks,
// earn/issued-invoice gates) -- this guard only asserts the CALL SITES exist, never re-implements
// GL math or invents a live tie-out check that would need real prod data to mean anything in CI.
import fs from "node:fs";

const LABEL = "verify-invoice-sent-requires-gl-posting";
const FILE = "apps/backend/src/accounting/invoices-bulk.routes.ts";

const POSTER_CALL = /await\s+postInvoiceGlAndAudit\(/;
const LATCH_CALL = /await\s+fireRevrecLatchOnInvoiceIssued\(/;

/**
 * Extracts the source slice for one `} else if (action === "<name>") { ... }` branch (or the
 * leading `if (action === "<name>") { ... }` for the first branch), up to the next sibling
 * `} else if (action ===` or the end of the enclosing function. Brace-counted so nested blocks
 * inside the branch don't truncate the slice early.
 */
function extractActionBranch(src, actionName) {
  const startRe = new RegExp(
    `(?:if|\\}\\s*else if)\\s*\\(action === "${actionName}"\\)\\s*\\{`
  );
  const startMatch = startRe.exec(src);
  if (!startMatch) return null;
  let depth = 1;
  let i = startMatch.index + startMatch[0].length;
  const bodyStart = i;
  for (; i < src.length && depth > 0; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") depth -= 1;
  }
  return src.slice(bodyStart, i - 1);
}

const ACTIONS_REQUIRING_BOTH_POSTERS = ["set_status", "mark_sent", "mark_factored"];

export function everyPostableActionCallsBothPosters(src) {
  for (const action of ACTIONS_REQUIRING_BOTH_POSTERS) {
    const branch = extractActionBranch(src, action);
    if (!branch) return { ok: false, reason: `could not locate action branch "${action}"` };
    if (!POSTER_CALL.test(branch)) {
      return { ok: false, reason: `action "${action}" never calls postInvoiceGlAndAudit` };
    }
    if (!LATCH_CALL.test(branch)) {
      return { ok: false, reason: `action "${action}" never calls fireRevrecLatchOnInvoiceIssued` };
    }
  }
  return { ok: true };
}

function check(src) {
  const result = everyPostableActionCallsBothPosters(src);
  if (!result.ok) {
    throw new Error(
      `invoices-bulk.routes.ts: ${result.reason} -- an invoice can reach a real A/R status ` +
        "(sent/paid/factored) through this action with zero accounting.journal_entry_postings rows " +
        "(ACCT-F26048 / CRITICAL-AR-TIEOUT-POSTED-WITHOUT-POSTING). Reuse the existing " +
        "postInvoiceGlAndAudit + fireRevrecLatchOnInvoiceIssued helpers -- never invent a new poster."
    );
  }
}

const src = fs.readFileSync(FILE, "utf8");

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    // Drop the poster call the mark_factored branch actually shipped without (ACCT-F26048): rename
    // the call site so the text "postInvoiceGlAndAudit(" no longer appears in that branch at all
    // (a bare comment-prefix would leave the call text intact for a substring-matching guard).
    src.replace(
      /if \(POSTABLE_INVOICE_STATUSES\.has\(String\(\(updateRes\.rows\[0\] as Record<string, unknown>\)\.status\)\)\) \{\n      await postInvoiceGlAndAudit/,
      "if (POSTABLE_INVOICE_STATUSES.has(String((updateRes.rows[0] as Record<string, unknown>).status))) {\n      await skippedPostInvoiceGlAndAudit"
    ),
    // Same shape, on mark_sent's call site.
    src.replace(
      "await postInvoiceGlAndAudit(client, { invoiceId: id, operatingCompanyId, actorUserId });\n    // GO-0014",
      "await skippedPostInvoiceGlAndAudit(client, { invoiceId: id, operatingCompanyId, actorUserId });\n    // GO-0014"
    ),
    src.replace(/await fireRevrecLatchOnInvoiceIssued/g, "await skippedFireRevrecLatchOnInvoiceIssued"),
    src.replace('action === "mark_factored"', 'action === "mark_factored_renamed"'),
  ];
  for (const mutated of mutations) {
    if (mutated === src) throw new Error("a mutation was a no-op (pattern did not match source)");
    try {
      check(mutated);
    } catch {
      caught += 1;
      continue;
    }
    throw new Error("a mutation escaped detection");
  }
  check(src);
  console.log(`${LABEL} SELFTEST PASS (${caught}/${mutations.length} planted defects caught)`);
} else {
  check(src);
  console.log(
    `${LABEL} PASS -- set_status, mark_sent, and mark_factored all call both postInvoiceGlAndAudit ` +
      "and fireRevrecLatchOnInvoiceIssued, so none of the three can land an invoice on sent/paid/" +
      "factored without a GL posting attempt"
  );
}
