#!/usr/bin/env node
// Guard (BANK-ECON-03 / BANK-SURF-03 — 0285-banking-transfer-gl-gap Option 1, owner-approved #3134):
// the bank-feed "mark as transfer" action must MINT (or link to) a real banking.transfers row via the
// EXISTING transfers.service insert path — not merely tag banking.bank_transactions columns. This is a
// static text guard (no DB required) so it runs in verify:pre-commit.
//
// Root cause this guards against regressing: POST /api/v1/banking/transactions/:id/transfer used to
// UPDATE banking.bank_transactions (status/category/transfer_kind/destination_bank_account_id) and
// return — no banking.transfers row was ever inserted, so TRANSFER_GL_POSTING_ENABLED had nothing to
// post against and the Transfers tab / reconciliation never tied the two legs (production evidence:
// banking.transfers = 0 rows even with the feature "wired").
//
// Independent review #3445 follow-ups also locked here:
//   - mint+stamp must share one txn with advisory lock + FOR UPDATE (no TOCTOU double-mint)
//   - outbox enqueue must gate on linkResult.changed (no sync_runs spam on idempotent retry)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = false;
const fail = (m) => {
  console.error(`FAIL verify-bank-feed-mark-transfer-writes-transfers: ${m}`);
  failed = true;
};

const read = (p) => readFileSync(join(root, p), "utf8");

const route = read("apps/backend/src/banking/categorization.routes.ts");
const service = read("apps/backend/src/banking/transfers.service.ts");
const transferModal = read("apps/frontend/src/pages/banking/TransferModal.tsx");
const recordTransferModal = read("apps/frontend/src/pages/banking/RecordTransferModal.tsx");
const bankingApi = read("apps/frontend/src/api/banking.ts");

// 1. The route must delegate minting/linking to the service — not update bank_transactions inline as a
//    dead-end tag with no paired ledger row.
if (!/markBankFeedLineAsTransfer/.test(route)) {
  fail("categorization.routes.ts /transfer route must call markBankFeedLineAsTransfer (transfers.service.ts)");
}

// 2. The service function must exist and must mint via insertTransferInClient (same writer as createTransfer).
if (!/export async function markBankFeedLineAsTransfer/.test(service)) {
  fail("transfers.service.ts must export markBankFeedLineAsTransfer");
}
if (!/async function insertTransferInClient/.test(service)) {
  fail("transfers.service.ts must define insertTransferInClient (shared mint writer)");
}
const mintFnStart = service.indexOf("async function mintTransferForBankFeedLineInClient");
if (mintFnStart < 0) {
  fail("mintTransferForBankFeedLineInClient must exist (in-txn mint; not createTransfer on a second connection)");
} else {
  const mintFn = service.slice(mintFnStart, mintFnStart + 1200);
  if (!/return insertTransferInClient\(/.test(mintFn)) {
    fail("mintTransferForBankFeedLineInClient must mint via insertTransferInClient — no new GL/ledger-insert math");
  }
  if (/return createTransfer\(/.test(mintFn)) {
    fail("mintTransferForBankFeedLineInClient must NOT call createTransfer() (separate connection = TOCTOU race)");
  }
}

// 3. matched_transfer_id must be the stamped dedupe key; stamp must be conditional (IS NULL).
if (!/matched_transfer_id\s*=\s*\$/.test(service)) {
  fail("markBankFeedLineAsTransfer must stamp banking.bank_transactions.matched_transfer_id");
}
if (!/AND matched_transfer_id IS NULL/.test(service)) {
  fail("stamp must be conditional on matched_transfer_id IS NULL (race loser must not overwrite)");
}

// 4. Double-mint / concurrency: advisory lock + FOR UPDATE + existingTransferId + idempotent + paired reuse.
if (!/pg_advisory_xact_lock\(hashtext/.test(service)) {
  fail("markBankFeedLineAsTransfer must take pg_advisory_xact_lock on the feed line before mint/stamp");
}
if (!/forUpdate:\s*true/.test(service)) {
  fail("markBankFeedLineAsTransfer must SELECT … FOR UPDATE the feed line under the advisory lock");
}
if (!/existingTransferId/.test(service)) fail("service must accept existingTransferId (link-only path)");
if (!/txn\.matched_transfer_id\)\s*\{\s*\n\s*return \{ transfer_id: txn\.matched_transfer_id, minted: false/.test(service)) {
  fail("service must be idempotent: a bank txn already carrying matched_transfer_id must never re-mint");
}
if (!/paired\?\.matched_transfer_id/.test(service)) {
  fail("service must reuse a paired leg's ALREADY-minted transfer instead of minting a second one");
}

// 5. No inline `INSERT INTO banking.transfers` outside transfers.service.ts.
for (const [name, src] of [
  ["categorization.routes.ts", route],
  ["bank-feed-gl-posting.service.ts", read("apps/backend/src/banking/bank-feed-gl-posting.service.ts")],
]) {
  if (/INSERT\s+INTO\s+banking\.transfers/i.test(src)) {
    fail(`${name} must not INSERT INTO banking.transfers directly — mint via transfers.service.ts`);
  }
}

// 6. Frontend: both callers that mint via createTransfer() BEFORE tagging the feed row must pass
//    existing_transfer_id.
if (!/existing_transfer_id:\s*created\.transfer\.id/.test(transferModal)) {
  fail("TransferModal.tsx must pass existing_transfer_id: created.transfer.id to markBankTransactionTransfer");
}
if (!/existing_transfer_id:\s*response\.transfer\.id/.test(recordTransferModal)) {
  fail("RecordTransferModal.tsx must pass existing_transfer_id: response.transfer.id to markBankTransactionTransfer");
}
if (!/existing_transfer_id\?:\s*string/.test(bankingApi)) {
  fail("api/banking.ts markBankTransactionTransfer body type must accept existing_transfer_id");
}

// 7. Outbox must gate on linkResult.changed (idempotent retry must not spam sync_runs).
if (!/if\s*\(\s*linkResult\.changed\s*\)/.test(route)) {
  fail("categorization.routes.ts /transfer must gate enqueueAccountingOutbox on linkResult.changed");
}
if (!/changed:\s*(true|false)\s+as const/.test(service) && !/changed:\s*true as const/.test(service)) {
  fail("markBankFeedLineAsTransfer must return changed:boolean so the route can gate outbox");
}

if (failed) process.exit(1);
console.log("PASS verify-bank-feed-mark-transfer-writes-transfers");
