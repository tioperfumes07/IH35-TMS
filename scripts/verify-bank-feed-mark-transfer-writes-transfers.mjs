#!/usr/bin/env node
// Guard (BANK-ECON-03 / BANK-SURF-03 — 0285-banking-transfer-gl-gap Option 1, owner-approved #3134):
// the bank-feed "mark as transfer" action must MINT (or link to) a real banking.transfers row via the
// EXISTING createTransfer() poster — not merely tag banking.bank_transactions columns. This is a static
// text guard (no DB required) so it runs in verify:pre-commit.
//
// Root cause this guards against regressing: POST /api/v1/banking/transactions/:id/transfer used to
// UPDATE banking.bank_transactions (status/category/transfer_kind/destination_bank_account_id) and
// return — no banking.transfers row was ever inserted, so TRANSFER_GL_POSTING_ENABLED had nothing to
// post against and the Transfers tab / reconciliation never tied the two legs (production evidence:
// banking.transfers = 0 rows even with the feature "wired").
//
//   1. The route must call the real mint-or-link service function (reuse the ONE poster — no new GL math
//      / no inline `INSERT INTO banking.transfers` outside transfers.service.ts).
//   2. That service function must call createTransfer() — the SAME already-proven Surface A poster used
//      by POST /banking/transfers — to mint, never write a second/parallel ledger insert.
//   3. The service function must stamp matched_transfer_id — the ONE dedupe key shared with
//      bank-feed-gl-posting.service.ts's "is_transfer" interlock and bank-recon's match.service.ts — so a
//      minted/linked feed line can never ALSO post a second JE through categorize.
//   4. Double-mint safety: an existing_transfer_id (RecordTransferModal/TransferModal already minted via
//      createTransfer) must link-only; a bank txn already carrying matched_transfer_id must be idempotent
//      (never re-mint); a paired leg already linked must be reused (never mint a second transfer for the
//      other leg of the same pairing).
//   5. The two frontend callers that mint via createTransfer() BEFORE calling markBankTransactionTransfer
//      must pass existing_transfer_id, so they never trigger a second mint for the same cash movement.

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

// 2. The service function must exist and must mint via createTransfer (reuse the ONE poster).
if (!/export async function markBankFeedLineAsTransfer/.test(service)) {
  fail("transfers.service.ts must export markBankFeedLineAsTransfer");
}
const mintFn = service.slice(
  service.indexOf("async function mintTransferForBankFeedLine"),
  service.indexOf("async function mintTransferForBankFeedLine") + 1500
);
if (!/return createTransfer\(/.test(mintFn)) {
  fail("mintTransferForBankFeedLine must mint via createTransfer() — no new GL/ledger-insert math");
}

// 3. matched_transfer_id must be the stamped dedupe key.
if (!/matched_transfer_id\s*=\s*\$/.test(service)) {
  fail("markBankFeedLineAsTransfer must stamp banking.bank_transactions.matched_transfer_id");
}

// 4. Double-mint safety: existingTransferId link-only, idempotent on already-linked, paired-leg reuse.
if (!/existingTransferId/.test(service)) fail("service must accept existingTransferId (link-only path)");
if (!/txn\.matched_transfer_id\)\s*\{\s*\n\s*return \{ transfer_id: txn\.matched_transfer_id, minted: false/.test(service)) {
  fail("service must be idempotent: a bank txn already carrying matched_transfer_id must never re-mint");
}
if (!/paired\?\.matched_transfer_id/.test(service)) {
  fail("service must reuse a paired leg's ALREADY-minted transfer instead of minting a second one");
}

// 5. No inline `INSERT INTO banking.transfers` outside the ONE canonical writer (createTransfer itself,
//    inside transfers.service.ts). Guards against a future PR re-introducing a second minting path.
for (const [name, src] of [
  ["categorization.routes.ts", route],
  ["bank-feed-gl-posting.service.ts", read("apps/backend/src/banking/bank-feed-gl-posting.service.ts")],
]) {
  if (/INSERT\s+INTO\s+banking\.transfers/i.test(src)) {
    fail(`${name} must not INSERT INTO banking.transfers directly — mint via createTransfer() in transfers.service.ts`);
  }
}

// 6. Frontend: both callers that mint via createTransfer() BEFORE tagging the feed row must pass
//    existing_transfer_id, or the backend route will (correctly, per its own contract) mint a SECOND
//    banking.transfers row for the same cash movement.
if (!/existing_transfer_id:\s*created\.transfer\.id/.test(transferModal)) {
  fail("TransferModal.tsx must pass existing_transfer_id: created.transfer.id to markBankTransactionTransfer");
}
if (!/existing_transfer_id:\s*response\.transfer\.id/.test(recordTransferModal)) {
  fail("RecordTransferModal.tsx must pass existing_transfer_id: response.transfer.id to markBankTransactionTransfer");
}
if (!/existing_transfer_id\?:\s*string/.test(bankingApi)) {
  fail("api/banking.ts markBankTransactionTransfer body type must accept existing_transfer_id");
}

if (failed) process.exit(1);
console.log("PASS verify-bank-feed-mark-transfer-writes-transfers");
