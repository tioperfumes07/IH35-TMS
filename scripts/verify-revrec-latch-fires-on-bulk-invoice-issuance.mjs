#!/usr/bin/env node
/**
 * verify-revrec-latch-fires-on-bulk-invoice-issuance.mjs (GO-0014 event2-silent-on-issued-invoices)
 *
 * OWNER DECISION B (docs/lockdown/OWNER-DECISION-ACCT-F5692-OPTION-B-2026-08-27.md) wired revrec
 * Event 2 (DR A/R / CR Unbilled) to fire when an invoice is ISSUED, but the trigger was only added
 * to invoice-send.service.ts's single-invoice /send path. accounting/invoices-bulk.routes.ts's
 * `mark_sent` action, and its `set_status` action's POSTABLE_INVOICE_STATUSES branch (which can also
 * land an invoice directly on 'paid'/'factored'), reach the SAME issued statuses through a separate
 * writer that never called the latch at all -- a load-linked invoice bulk-marked sent (or bulk-set
 * straight to paid/factored) silently never got its Event 2 JE.
 *
 * The fix extracts the trigger into a shared helper, fireRevrecLatchOnInvoiceIssued
 * (poster.service.ts), and calls it from all three writers. This guard asserts, against the REAL
 * files:
 *   1. poster.service.ts exports fireRevrecLatchOnInvoiceIssued, and its body calls
 *      postLoadRevenueLatch (reuses the existing Event 2 poster -- never a second A/R poster).
 *   2. invoice-send.service.ts still calls fireRevrecLatchOnInvoiceIssued (the refactor did not drop
 *      the original, already-shipped trigger).
 *   3. invoices-bulk.routes.ts's set_status POSTABLE_INVOICE_STATUSES branch calls it.
 *   4. invoices-bulk.routes.ts's mark_sent branch calls it.
 *
 * FAIL if any call site regresses to silence.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-revrec-latch-fires-on-bulk-invoice-issuance";

const POSTER_FILE = "apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts";
const SEND_FILE = "apps/backend/src/accounting/invoice-send.service.ts";
const BULK_FILE = "apps/backend/src/accounting/invoices-bulk.routes.ts";

function readReal(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * Injectable core: pass `sources` to exercise this exact function against synthetic content;
 * omit it to check the real repo files.
 */
export function check(sources) {
  const failures = [];

  const posterSrc = sources ? sources.poster : (() => { try { return readReal(POSTER_FILE); } catch { return null; } })();
  const sendSrc = sources ? sources.send : (() => { try { return readReal(SEND_FILE); } catch { return null; } })();
  const bulkSrc = sources ? sources.bulk : (() => { try { return readReal(BULK_FILE); } catch { return null; } })();

  if (posterSrc == null) return [`${POSTER_FILE} not found`];
  if (sendSrc == null) return [`${SEND_FILE} not found`];
  if (bulkSrc == null) return [`${BULK_FILE} not found`];

  // (1) poster.service.ts's helper must exist and must reuse postLoadRevenueLatch internally.
  const helperStart = posterSrc.indexOf("export async function fireRevrecLatchOnInvoiceIssued");
  if (helperStart < 0) {
    failures.push(`${POSTER_FILE}: fireRevrecLatchOnInvoiceIssued export not found`);
  } else {
    const helperBody = posterSrc.slice(helperStart, helperStart + 1500);
    if (!/postLoadRevenueLatch\s*\(/.test(helperBody)) {
      failures.push(
        `${POSTER_FILE}: fireRevrecLatchOnInvoiceIssued no longer calls postLoadRevenueLatch -- ` +
          `it may have grown a second, independent A/R poster instead of reusing the existing Event 2 latch`
      );
    }
  }

  // (2) invoice-send.service.ts must still call the (now-shared) helper.
  if (!/fireRevrecLatchOnInvoiceIssued\s*\(/.test(sendSrc)) {
    failures.push(
      `${SEND_FILE}: no longer calls fireRevrecLatchOnInvoiceIssued -- the single-invoice /send path's ` +
        `OWNER DECISION B trigger may have regressed`
    );
  }

  // (3) set_status's POSTABLE_INVOICE_STATUSES branch must call the helper. Scope to the block
  // between the postInvoiceGlAndAudit call inside that branch and the next `else if` to avoid a
  // false-pass on the unrelated mark_sent branch's own call further down the file.
  const setStatusBranchStart = bulkSrc.indexOf('if (POSTABLE_INVOICE_STATUSES.has(');
  const markSentBranchStart = bulkSrc.indexOf('else if (action === "mark_sent")');
  if (setStatusBranchStart < 0 || markSentBranchStart < 0 || markSentBranchStart <= setStatusBranchStart) {
    failures.push(`${BULK_FILE}: could not locate set_status/mark_sent branch boundaries -- extractor may be stale`);
  } else {
    const setStatusBranch = bulkSrc.slice(setStatusBranchStart, markSentBranchStart);
    if (!/fireRevrecLatchOnInvoiceIssued\s*\(/.test(setStatusBranch)) {
      failures.push(
        `${BULK_FILE}: set_status's POSTABLE_INVOICE_STATUSES branch does not call fireRevrecLatchOnInvoiceIssued -- ` +
          `a bulk status jump straight to sent/paid/factored on a load-linked invoice would silently skip Event 2`
      );
    }
    if (!/oldRow\.source_load_id/.test(setStatusBranch)) {
      failures.push(`${BULK_FILE}: set_status branch's revrec trigger is missing its oldRow.source_load_id guard`);
    }

    // (4) mark_sent branch: from its start to the next `} else if (action ===` or the function's end.
    const nextBranchAfterMarkSent = bulkSrc.indexOf('else if (action ===', markSentBranchStart + 10);
    const markSentBranch = bulkSrc.slice(markSentBranchStart, nextBranchAfterMarkSent > 0 ? nextBranchAfterMarkSent : bulkSrc.length);
    if (!/fireRevrecLatchOnInvoiceIssued\s*\(/.test(markSentBranch)) {
      failures.push(
        `${BULK_FILE}: mark_sent branch does not call fireRevrecLatchOnInvoiceIssued -- a bulk mark-sent ` +
          `of a load-linked invoice would silently skip Event 2 (the exact GO-0014 outage)`
      );
    }
    if (!/oldRow\.source_load_id/.test(markSentBranch)) {
      failures.push(`${BULK_FILE}: mark_sent branch's revrec trigger is missing its oldRow.source_load_id guard`);
    }
  }

  return failures;
}

export { check as run };

if (process.argv.includes("--selftest")) {
  const goodPoster = `
    export async function fireRevrecLatchOnInvoiceIssued(client, input) {
      const fire = async () => { await postLoadRevenueLatch({ load_id: input.source_load_id }); };
      if (!enqueueAfterCommit(client, { label: "x", run: fire })) await fire();
    }
  `;
  const regressedPosterSecondPoster = `
    export async function fireRevrecLatchOnInvoiceIssued(client, input) {
      const fire = async () => { await createJournalEntry({ postings: [] }); };
      if (!enqueueAfterCommit(client, { label: "x", run: fire })) await fire();
    }
  `;
  const goodSend = `await fireRevrecLatchOnInvoiceIssued(client, { source_load_id: loadId });`;
  const regressedSend = `// trigger removed`;

  const goodBulk = `
    if (POSTABLE_INVOICE_STATUSES.has(String(statusPayload.status))) {
      await postInvoiceGlAndAudit(client, { invoiceId: id });
      if (oldRow.source_load_id) {
        await fireRevrecLatchOnInvoiceIssued(client, { source_load_id: String(oldRow.source_load_id) });
      }
    }
  } else if (action === "mark_sent") {
    await postInvoiceGlAndAudit(client, { invoiceId: id });
    if (oldRow.source_load_id) {
      await fireRevrecLatchOnInvoiceIssued(client, { source_load_id: String(oldRow.source_load_id) });
    }
  } else if (action === "mark_factored") {
  `;
  const regressedBulkNoSetStatusTrigger = `
    if (POSTABLE_INVOICE_STATUSES.has(String(statusPayload.status))) {
      await postInvoiceGlAndAudit(client, { invoiceId: id });
    }
  } else if (action === "mark_sent") {
    await postInvoiceGlAndAudit(client, { invoiceId: id });
    if (oldRow.source_load_id) {
      await fireRevrecLatchOnInvoiceIssued(client, { source_load_id: String(oldRow.source_load_id) });
    }
  } else if (action === "mark_factored") {
  `;
  const regressedBulkNoMarkSentTrigger = `
    if (POSTABLE_INVOICE_STATUSES.has(String(statusPayload.status))) {
      await postInvoiceGlAndAudit(client, { invoiceId: id });
      if (oldRow.source_load_id) {
        await fireRevrecLatchOnInvoiceIssued(client, { source_load_id: String(oldRow.source_load_id) });
      }
    }
  } else if (action === "mark_sent") {
    await postInvoiceGlAndAudit(client, { invoiceId: id });
  } else if (action === "mark_factored") {
  `;

  const checks = [
    ["fully-fixed shape produces zero failures", check({ poster: goodPoster, send: goodSend, bulk: goodBulk }).length === 0],
    [
      "poster helper regressing to a second/independent poster is caught",
      check({ poster: regressedPosterSecondPoster, send: goodSend, bulk: goodBulk }).some((f) => f.includes("second, independent A/R poster")),
    ],
    [
      "invoice-send.service.ts dropping the trigger is caught",
      check({ poster: goodPoster, send: regressedSend, bulk: goodBulk }).some((f) => f.includes("no longer calls fireRevrecLatchOnInvoiceIssued")),
    ],
    [
      "set_status branch missing the trigger is caught",
      check({ poster: goodPoster, send: goodSend, bulk: regressedBulkNoSetStatusTrigger }).some((f) => f.includes("set_status's POSTABLE_INVOICE_STATUSES branch")),
    ],
    [
      "mark_sent branch missing the trigger is caught",
      check({ poster: goodPoster, send: goodSend, bulk: regressedBulkNoMarkSentTrigger }).some((f) => f.includes("mark_sent branch does not call")),
    ],
    ["real repo files currently satisfy this guard (no args = real files)", check().length === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = check();
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — revrec Event 2 fires from every writer that can issue a load-linked invoice (send, bulk set_status, bulk mark_sent)`);
}
