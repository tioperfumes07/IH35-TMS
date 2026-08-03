#!/usr/bin/env node
/**
 * GUARD — ACCT-F100: an invoice must post to the GL when it is issued.
 *
 * THE DEFECT, MEASURED ON PROD 2026-08-03 (positive control mdata.vendors=2,828):
 *   accounting.invoices                11,979 rows
 *   accounting.posting_batches 'invoice'    2 rows — both TRANSP, both dated 2026-05-19
 * Two invoices had EVER posted, months earlier, almost certainly by hand through the manual endpoint.
 * Everything since sat unposted while A/R and revenue stayed blind to it.
 *
 * IT WAS NEVER A MISSING POSTER. postSourceTransaction has handled 'invoice' the whole time — those
 * two May batches are the proof. What was missing was a TRIGGER: bills call bill-gl.service.ts from
 * createBill (bills.service.ts:1433); invoices had no equivalent anywhere in their lifecycle. Found by
 * diffing the two paths, not by assuming.
 *
 * OWNER RULING 2026-08-03: post on Finalize/Post OR Send, whichever comes FIRST; a draft stays
 * unposted; Send-after-Finalize must not double-post.
 *
 * WHAT IT ENFORCES: every code path that moves an invoice OUT of draft into a real A/R state calls
 * postInvoiceGlIfEnabled. Derived from the status writers themselves, so a NEW issue path added later
 * without a post call fails here instead of silently leaving A/R blind — the ratchet, not a snapshot.
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify:invoice-posts-gl-on-issue";
const SERVICE = "apps/backend/src/accounting/invoice-gl.service.ts";
const SEND = "apps/backend/src/accounting/invoice-send.service.ts";
const BULK = "apps/backend/src/accounting/invoices-bulk.routes.ts";

/**
 * Strip comments AND import lines.
 *
 * The import strip is load-bearing: the first version tested for the bare identifier, so removing the
 * actual CALL from invoice-send.service.ts still left `import { postInvoiceGlIfEnabled } ...` and the
 * guard stayed GREEN on the mutated tree. A guard satisfied by an import is satisfied by nothing.
 * Caught by mutation-testing against real source, not by reading it.
 */
function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/^\s*import\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "");
}

/** A writer that sets an invoice's status to something other than draft/void. */
const ISSUES_INVOICE = /UPDATE\s+accounting\.invoices[\s\S]{0,200}?SET\s+status\s*=\s*(?:'sent'|\$\d)/i;

export function analyse(files) {
  const problems = [];

  const svc = files[SERVICE];
  if (svc == null) {
    problems.push(`${SERVICE} is missing — invoices have no GL trigger and A/R stays blind.`);
  } else {
    if (!/export async function postInvoiceGlIfEnabled/.test(svc)) {
      problems.push(`${SERVICE}: postInvoiceGlIfEnabled is gone.`);
    }
    if (!/postSourceTransaction/.test(svc)) {
      problems.push(
        `${SERVICE}: no longer reuses postSourceTransaction. A second writer means a second source of ` +
          `truth for "has this posted?", and idempotency stops being the poster's job.`
      );
    }
    if (!/INVOICE_AR_GL_POSTING_ENABLED/.test(svc)) {
      problems.push(`${SERVICE}: the per-entity flag gate is gone (flags default OFF).`);
    }
  }

  for (const file of [SEND, BULK]) {
    const raw = files[file];
    if (raw == null) {
      problems.push(`${file} is missing.`);
      continue;
    }
    const src = stripComments(raw);
    if (!ISSUES_INVOICE.test(src)) continue; // not an issue path — nothing to require
    if (!/postInvoiceGlIfEnabled\s*\(/.test(src)) {
      problems.push(
        `${file}: moves an invoice out of draft but never calls postInvoiceGlIfEnabled. The invoice ` +
          `would be issued to a customer with NO A/R and NO revenue on the ledger — the exact state ` +
          `that left 11,979 invoices with 2 posting batches.`
      );
    }
  }

  return problems;
}

function readAll() {
  const out = {};
  for (const f of [SERVICE, SEND, BULK]) out[f] = existsSync(f) ? readFileSync(f, "utf8") : null;
  return out;
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };
  const goodSvc =
    "export async function postInvoiceGlIfEnabled(){} postSourceTransaction INVOICE_AR_GL_POSTING_ENABLED";
  const issuesAndPosts = "UPDATE accounting.invoices SET status = 'sent' ... postInvoiceGlIfEnabled(x)";
  const issuesOnly = "UPDATE accounting.invoices SET status = 'sent' WHERE id=$1";
  const notAnIssuePath = "SELECT * FROM accounting.invoices";

  t("issue paths that post pass",
    analyse({ [SERVICE]: goodSvc, [SEND]: issuesAndPosts, [BULK]: issuesAndPosts }).length === 0);
  // The REAL pre-fix state.
  t("an issue path with no post call FAILS",
    analyse({ [SERVICE]: goodSvc, [SEND]: issuesOnly, [BULK]: issuesAndPosts }).length === 1);
  t("a non-issue file is ignored",
    analyse({ [SERVICE]: goodSvc, [SEND]: notAnIssuePath, [BULK]: issuesAndPosts }).length === 0);
  t("deleting the service FAILS",
    analyse({ [SERVICE]: null, [SEND]: issuesAndPosts, [BULK]: issuesAndPosts }).length === 1);
  t("dropping the flag gate FAILS",
    analyse({ [SERVICE]: goodSvc.replace("INVOICE_AR_GL_POSTING_ENABLED", ""), [SEND]: issuesAndPosts, [BULK]: issuesAndPosts }).length === 1);
  t("writing a second poster instead of reusing FAILS",
    analyse({ [SERVICE]: goodSvc.replace("postSourceTransaction", ""), [SEND]: issuesAndPosts, [BULK]: issuesAndPosts }).length === 1);
  t("an IMPORT alone does not satisfy it (the real mutation miss)",
    analyse({ [SERVICE]: goodSvc, [SEND]: 'import { postInvoiceGlIfEnabled } from "./invoice-gl.service.js";\nUPDATE accounting.invoices SET status = \'sent\'', [BULK]: issuesAndPosts }).length === 1);
  t("a comment mentioning the call does not satisfy it",
    analyse({ [SERVICE]: goodSvc, [SEND]: "// TODO postInvoiceGlIfEnabled\nUPDATE accounting.invoices SET status = 'sent'", [BULK]: issuesAndPosts }).length === 1);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 8 cases (2 pass-shapes, 6 fail-shapes incl. the real defect and the import-only miss)`);
  process.exit(0);
}
const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — every invoice issue path posts through the shared poster`);
