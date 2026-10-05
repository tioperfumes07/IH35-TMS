#!/usr/bin/env node
// ROUND 360 (CC-2) — MATCH WRITES NO JOURNAL ENTRY; UNMATCH REVERSES NONE. The matched document was posted when it was
// created; posting again on match double-counts. Spec: docs/bus/00-CONTRACT-BANK-FEED-STATE-MACHINE-MATCH-UNMATCH-CATEGORIZE-UNDO.md
// The only entries the match handler may write are the ones the MATCH ITSELF creates — QuickBooks' own Bank Deposit
// when a receipt waits in a holding account, the variance the operator resolves, and the fuel / Faro / chargeback
// events whose source document posts nothing until matched — and UNMATCH must reverse every one of them:
//   poster in match.service.ts            reversed on unmatch by
//   sweepMatchedReceiptToBank             bank-line-state-machine reverseMatchCreatedEntries (customer_payment_deposit /
//                                         factoring_advance_deposit)
//   postDifferenceJournalEntry            reverseMatchCreatedEntries (bank_reconciliation_variance source link)
//   postFaroRsvDepositsOnPaymentMatch     reverseMatchCreatedEntries (Faro register lines on the same payment)
//   postFuelFillOnBankMatch               unmatchBankTransactionOnClient (matchCreatedJe: fuel / relay)
//   postFactoringChargebackEvent          unmatchBankTransactionOnClient (matchCreatedJe: factoring advance)
//   postFaroReserveRowOnBankMatch         undo 'added' branch (kind declared by stampPosted) + Faro entry release
//   postPendingFaroReserveRowOnAccept     same Faro row poster; 1:1 + multi share this wrapper
// Static, ceiling 0: a posting call in match.service.ts outside this list FAILS; a listed poster whose reversal is gone
// FAILS; the 'matched' undo branch must never void or revoke the document. The live proof is the fork finish test (trial
// balance unchanged across match + unmatch for every document type).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-match-posts-nothing";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MATCH = "apps/backend/src/accounting/bank-recon/match.service.ts";
const ENGINE = "apps/backend/src/banking/bank-line-state-machine.service.ts";
const UNMATCH = "apps/backend/src/accounting/bank-recon/recon-worklist.service.ts";
const FARO = "apps/backend/src/factoring/faro-reserve-entries.service.ts";

export const MATCH_TIME_POSTERS = [
  "sweepMatchedReceiptToBank",
  "postDifferenceJournalEntry",
  "postFaroRsvDepositsOnPaymentMatch",
  "postFuelFillOnBankMatch",
  "postFactoringChargebackEvent",
  "postFaroReserveRowOnBankMatch",
  "postPendingFaroReserveRowOnAccept",
];

const strip = (src) => String(src).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

export function check({ match, engine, unmatch, faro }) {
  const f = [];
  const code = strip(match);
  // every call that can write a journal entry
  const calls = [...code.matchAll(/\b(post[A-Z]\w*|sweep[A-Z]\w*|createJournalEntryOnClient|reverse[A-Z]\w*)\s*\(/g)]
    .filter((m) => !/(async )?function\s*$/.test(code.slice(Math.max(0, m.index - 16), m.index)))
    .map((m) => m[1]);
  const allowedHelpers = new Set([...MATCH_TIME_POSTERS, "postSourceTransactionInClientTx"]);
  for (const name of new Set(calls)) if (!allowedHelpers.has(name)) f.push(`${MATCH}: ${name}() — a new posting call in the match path; match writes no journal entry (or add it to MATCH_TIME_POSTERS WITH its unmatch reversal)`);
  const pst = [...code.matchAll(/\bpostSourceTransactionInClientTx\s*\(/g)].length;
  if (pst > 1) f.push(`${MATCH}: postSourceTransactionInClientTx is called ${pst} times — only sweepMatchedReceiptToBank may post a source transaction from the match path`);
  const inserts = [...code.matchAll(/INSERT INTO accounting\.journal_entries\b/g)];
  const diffStart = code.indexOf("async function postDifferenceJournalEntry");
  const diffEnd = code.indexOf("\nasync function", diffStart + 10) > 0 ? code.indexOf("\nasync function", diffStart + 10) : code.indexOf("\nexport async function", diffStart + 10);
  for (const m of inserts) if (!(m.index > diffStart && m.index < diffEnd)) f.push(`${MATCH}: a raw journal entry INSERT outside postDifferenceJournalEntry`);
  // each poster's reversal
  if (!/source_transaction_type = 'customer_payment_deposit'/.test(engine) || !/source_transaction_type = 'factoring_advance_deposit'/.test(engine)) f.push(`${ENGINE}: unmatch no longer reverses the deposit sweep the match created`);
  if (!/relationship_role = 'bank_reconciliation_variance'/.test(engine)) f.push(`${ENGINE}: unmatch no longer reverses the variance entry the match created`);
  if (!/JOIN accounting\.faro_reserve_entries e ON e\.bank_transaction_id = bt\.id/.test(engine)) f.push(`${ENGINE}: unmatch no longer reverses the Faro Rsv Deposits posted on the payment match`);
  if (!/row\.prev_fuel_transaction_id \|\| row\.prev_relay_fuel_transaction_id \|\| row\.prev_factoring_advance_id/.test(unmatch)) f.push(`${UNMATCH}: unmatch no longer reverses the fuel / Relay fill or chargeback entry the match created`);
  if (!/stampPosted\(client, oci, entry, je\.id, input\.actor_user_id, "added"\)/.test(faro)) f.push(`${FARO}: a Faro row posted for the line must be kind 'added' so undo reverses it`);
  // the matched branch: link only
  const mb = engine.slice(engine.indexOf('} else if (line.resolution_kind === "matched") {'), engine.indexOf('} else if (line.resolution_kind === "transfer") {'));
  if (!mb) f.push(`${ENGINE}: the 'matched' undo branch is gone`);
  else if (/voidDocument|revokeTransfer|voidDocumentsCreatedByLine/.test(mb)) f.push(`${ENGINE}: the 'matched' undo branch voids or revokes the document — UNMATCH only breaks the link`);
  return f;
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const real = () => ({ match: read(MATCH), engine: read(ENGINE), unmatch: read(UNMATCH), faro: read(FARO) });

if (process.argv.includes("--selftest")) {
  const r = real();
  const fails = [];
  if (check(r).length) fails.push(`tree not clean: ${check(r).join("; ")}`);
  const plants = [
    ["a new poster on match", { ...r, match: r.match.replace("const journalEntryId = await postDifferenceJournalEntry(client, {", "await postExpenseAgainOnMatch(client);\n    const journalEntryId = await postDifferenceJournalEntry(client, {") }],
    ["sweep reversal gone", { ...r, engine: r.engine.replace("source_transaction_type = 'customer_payment_deposit'", "source_transaction_type = 'x'") }],
    ["variance reversal gone", { ...r, engine: r.engine.replace("relationship_role = 'bank_reconciliation_variance'", "relationship_role = 'x'") }],
    ["fuel reversal gone", { ...r, unmatch: r.unmatch.replace("row.prev_fuel_transaction_id || row.prev_relay_fuel_transaction_id || row.prev_factoring_advance_id", "false") }],
    ["unmatch voids the document", { ...r, engine: r.engine.replace("    outcome.released_documents.push(...unmatched.released);", "    outcome.released_documents.push(...unmatched.released);\n    await voidDocumentsCreatedByLine(client, input as never, outcome);") }],
  ];
  for (const [n, s] of plants) if (JSON.stringify(s) === JSON.stringify(r)) fails.push(`plant did not change the source: ${n}`); else if (!check(s).length) fails.push(`plant escaped: ${n}`);
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length + 1}/${plants.length + 1}`);
  process.exit(0);
}

const fails = check(real());
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — the match path posts only the ${MATCH_TIME_POSTERS.length} match-created entries, each reversed on unmatch; the 'matched' undo branch never voids or revokes the document`);
