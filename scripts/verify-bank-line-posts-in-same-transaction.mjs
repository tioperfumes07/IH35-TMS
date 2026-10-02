#!/usr/bin/env node
// OWNER LAW 2026-10-02 — competing-engine audit, BANKING. A bank line posts to the GL only when it is categorized or matched
// in Banking, and the journal entry is written IN THE SAME DB TRANSACTION as the categorization — a categorized line can
// never be committed without its entry (the old shape: tag commits, poster runs later in its own transaction and
// swallows its failure). Fails if:
//   1. the bank-feed poster opens its own posting transaction (postSourceTransaction) instead of the caller's client;
//   2. a categorize route (single / categorize-bulk / bulk-categorize) posts with the after-commit wrapper
//      (maybePostBankCategorizationToGl) instead of postBankCategorizationOnClient inside its transaction;
//   4. the reconcile bulk endpoint can set status='categorized' with only a text label (no account, no entry);
//   3. the poster loses the matched-document interlock (a line matched to its expense / fuel purchase / Relay fill /
//      invoice / payment / settlement / factoring advance must never ALSO be posted by categorization).
// Static, <1s. --selftest plants each regression and proves it fails.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-bank-line-posts-in-same-transaction";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POSTER = "apps/backend/src/banking/bank-feed-gl-posting.service.ts";
const ROUTES = "apps/backend/src/banking/categorization.routes.ts";
const RECONCILE = "apps/backend/src/banking/obligation-reconcile.routes.ts";
const CATEGORIZE_ROUTES = [
  '"/api/v1/banking/transactions/:id/categorize"',
  '"/api/v1/banking/transactions/categorize-bulk"',
  '"/api/v1/banking/transactions/bulk-categorize"',
];

/** The body of one route registration: from its path string to the next `app.` registration. */
function routeBody(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) return null;
  const next = src.indexOf("\n  app.", i + marker.length);
  return src.slice(i, next < 0 ? undefined : next);
}

export function check({ poster, routes, reconcile = "" }) {
  const problems = [];
  const bulk = routeBody(reconcile, '"/api/v1/banking/reconcile/bulk"');
  if (bulk !== null) {
    const gate = bulk.indexOf("if (LABEL_ONLY_CATEGORIZE_RETIRED) return -1;");
    const cat = bulk.indexOf("status = 'categorized'");
    if (cat >= 0 && (gate < 0 || gate > cat)) problems.push("obligation-reconcile.routes.ts /reconcile/bulk: label-only categorize (no account, no entry) is reachable");
  }
  if (/\bpostSourceTransaction\(/.test(poster)) problems.push(`${POSTER}: posts in its own transaction (postSourceTransaction) — use the caller's client`);
  if (!/export async function postBankCategorizationOnClient\(/.test(poster)) problems.push(`${POSTER}: postBankCategorizationOnClient is missing`);
  if (!/postSourceTransactionInClientTx\(/.test(poster)) problems.push(`${POSTER}: does not post on the caller's client (postSourceTransactionInClientTx)`);
  if (!/matched_document_id\) return \{ ok: false, reason: "already_matched_to_document" \}/.test(poster)) {
    problems.push(`${POSTER}: the matched-document interlock is gone (a matched line would be posted twice)`);
  }
  for (const marker of CATEGORIZE_ROUTES) {
    const body = routeBody(routes, marker);
    if (body === null) continue;
    if (/maybePostBankCategorizationToGl\(/.test(body)) problems.push(`${ROUTES} ${marker}: posts after commit (maybePostBankCategorizationToGl)`);
    if (!/postBankCategorizationOnClient\(client/.test(body)) problems.push(`${ROUTES} ${marker}: does not post inside its categorize transaction`);
  }
  return problems;
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

if (process.argv.includes("--selftest")) {
  const real = { poster: read(POSTER), routes: read(ROUTES), reconcile: read(RECONCILE) };
  if (check(real).length) { console.error(`${LABEL} --selftest FAIL: real tree not clean: ${check(real)[0]}`); process.exit(1); }
  const cases = [
    ["poster back on its own transaction", { ...real, poster: real.poster + "\nawait postSourceTransaction(x, y);" }],
    ["interlock removed", { ...real, poster: real.poster.replace('if (txn.matched_document_id) return { ok: false, reason: "already_matched_to_document" };', "") }],
    ["label-only categorize back", { ...real, reconcile: real.reconcile.replace("if (LABEL_ONLY_CATEGORIZE_RETIRED) return -1;", "") }],
    ["single categorize posts after commit", { ...real, routes: real.routes.replace("bankFeedGl = await postBankCategorizationOnClient(client, {", "bankFeedGl = await maybePostBankCategorizationToGl({") }],
  ];
  const missed = cases.filter(([, files]) => check(files).length === 0).map(([n]) => n);
  if (missed.length) { console.error(`${LABEL} --selftest FAIL: not caught: ${missed.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${cases.length}/${cases.length} plants caught; real tree clean`);
  process.exit(0);
}

const problems = check({ poster: read(POSTER), routes: read(ROUTES), reconcile: read(RECONCILE) });
if (problems.length) { console.error(`${LABEL}: FAIL —\n  ${problems.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — every categorize route posts its journal entry on its own transaction; the poster uses the caller's client and keeps the matched-document interlock; no label-only categorize`);
