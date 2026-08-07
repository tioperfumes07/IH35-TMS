#!/usr/bin/env node
/**
 * GUARD — verify-invoice-gl-no-nested-connection (LV-011)
 *
 * THE DEFECT THIS ASSERTS
 * POST /api/v1/accounting/invoices/:id/send hung forever on prod with ZERO side effects (repro
 * INV-2026-00003). Not a slow query — a self-inflicted lock wait:
 *
 *   withCompanyScope opens txn A
 *     -> sendDraftInvoice UPDATEs accounting.invoices SET status='sent'   (row lock held by txn A)
 *       -> postInvoiceGlIfEnabled -> withCurrentUser opens CONNECTION B
 *         -> the posting engine touches that same invoice row
 *           -> B waits for A to commit ... A is awaiting B. Forever.
 *
 * Postgres cannot rescue this: txn A is idle-in-transaction waiting on the client, so there is no
 * cycle in the lock graph to detect and no deadlock error is ever raised. The request just never
 * returns, the transaction never commits, and every effect rolls back — which is exactly why it
 * looked like "nothing happened" rather than an error.
 *
 * THE RULE
 * An invoice GL post must run on the CALLER'S transaction (postSourceTransactionInClientTx), never
 * through an entrypoint that opens its own connection (postSourceTransaction / withCurrentUser /
 * withCompanyScope / withLuciaBypass) while the caller holds a lock on the same row.
 *
 * METHOD: comments and strings are stripped before asserting, because these very comments name the
 * forbidden functions; --selftest mutates the real source and requires every assertion to trip.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-invoice-gl-no-nested-connection";
const GL = "apps/backend/src/accounting/invoice-gl.service.ts";
const SEND = "apps/backend/src/accounting/invoice-send.service.ts";

const CONNECTION_OPENERS = ["withCurrentUser", "withCompanyScope", "withLuciaBypass"];

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function check(sources) {
  const gl = stripCommentsAndStrings(sources[GL]);
  const send = stripCommentsAndStrings(sources[SEND]);
  const errors = [];

  for (const opener of CONNECTION_OPENERS) {
    if (new RegExp(`\\b${opener}\\s*\\(`).test(gl)) {
      errors.push(
        `${GL}: calls ${opener}( — that opens a SECOND connection while the caller's transaction ` +
          `already holds the invoice row lock. This is the LV-011 hang.`
      );
    }
  }

  // The poster must be the caller-transaction variant.
  if (!/postSourceTransactionInClientTx\s*\(/.test(gl)) {
    errors.push(
      `${GL}: does not use postSourceTransactionInClientTx — the GL post must run on the caller's ` +
        `transaction, not its own connection`
    );
  }
  if (/\bawait\s+postSourceTransaction\s*\(/.test(gl)) {
    errors.push(
      `${GL}: calls postSourceTransaction( — that entrypoint wraps itself in withCurrentUser and ` +
        `reintroduces the nested-connection hang`
    );
  }

  // The helper must actually receive a client, otherwise it cannot join the caller's txn.
  if (!/export async function postInvoiceGlIfEnabled\(\s*client\b/.test(gl)) {
    errors.push(`${GL}: postInvoiceGlIfEnabled does not take the caller's client as its first argument`);
  }
  if (!/export async function isInvoiceGlPostingEnabled\(\s*client\b/.test(gl)) {
    errors.push(`${GL}: isInvoiceGlPostingEnabled does not take the caller's client — it would open its own`);
  }

  // And the send path must pass it.
  if (!/postInvoiceGlIfEnabled\(\s*client\b/.test(send)) {
    errors.push(`${SEND}: does not pass its open client into postInvoiceGlIfEnabled`);
  }
  return errors;
}

function loadAll() {
  return { [GL]: readFileSync(GL, "utf8"), [SEND]: readFileSync(SEND, "utf8") };
}

function selftest() {
  const real = loadAll();
  const baseline = check(real);
  if (baseline.length) {
    console.error(`${LABEL} --selftest FAIL — real sources do not pass:`);
    for (const e of baseline) console.error(`  - ${e}`);
    process.exit(1);
  }

  const mutations = [
    [
      "nested connection restored",
      GL,
      (x) => x.replace("postSourceTransactionInClientTx(\n      client,", "postSourceTransaction("),
    ],
    [
      "flag read opens its own connection",
      GL,
      (x) => x.replace("export async function isInvoiceGlPostingEnabled(\n  client: DbClient,", "export async function isInvoiceGlPostingEnabled(\n  _unused: number,"),
    ],
    [
      "client no longer passed from send",
      SEND,
      (x) => x.replace("postInvoiceGlIfEnabled(client as never,", "postInvoiceGlIfEnabled(undefined as never,"),
    ],
  ];

  for (const [name, file, mutate] of mutations) {
    const broken = { ...real, [file]: mutate(real[file]) };
    if (broken[file] === real[file]) {
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

const errors = check(loadAll());
if (errors.length) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s): invoice send can hang on its own lock:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — the invoice GL post runs on the caller's transaction; no second connection can ` +
    `wait on the row the caller already locked.`
);
