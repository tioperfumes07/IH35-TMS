#!/usr/bin/env node
/**
 * B-1 §5 — online banking match banner on original documents (register Edit path).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-b1-online-banking-match-banner";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(src, needle, where) {
  if (!src.includes(needle)) throw new Error(`${where}: missing ${JSON.stringify(needle)}`);
}

function main() {
  const banner = read("apps/frontend/src/components/accounting/OnlineBankingMatchBanner.tsx");
  assertIncludes(banner, 'data-testid="b1-online-banking-match-banner"', "OnlineBankingMatchBanner");
  assertIncludes(banner, 'data-testid="b1-online-banking-unmatch"', "OnlineBankingMatchBanner");
  assertIncludes(banner, "unmatchBankTransaction", "OnlineBankingMatchBanner");
  assertIncludes(banner, "1 online banking match", "OnlineBankingMatchBanner");

  const api = read("apps/frontend/src/api/banking.ts");
  assertIncludes(api, "unmatchBankTransaction", "banking.ts");
  assertIncludes(api, "/api/v1/bank-recon/unmatch", "banking.ts");

  for (const file of [
    "apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx",
    "apps/frontend/src/pages/accounting/BillPaymentDetailPage.tsx",
    "apps/frontend/src/pages/accounting/PaymentDetailPage.tsx",
    "apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx",
    "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
    "apps/frontend/src/pages/banking/TransfersListPage.tsx",
    "apps/frontend/src/pages/accounting/BillDetailPage.tsx",
  ]) {
    assertIncludes(read(file), "OnlineBankingMatchBanner", file);
  }

  const recon = read("apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts");
  assertIncludes(recon, 'app.post("/api/v1/bank-recon/unmatch"', "recon-worklist.routes.ts");
  assertIncludes(recon, "Journal entry / Transfer / Factoring advance / Bill", "recon-worklist.routes.ts");

  const bills = read("apps/backend/src/accounting/bills.service.ts");
  assertIncludes(bills, "bt.matched_bill_id = $1::uuid", "bills.service.ts");
  assertIncludes(bills, "matched_bank_transaction_id: matchedBank?.id ?? null", "bills.service.ts");

  console.log(`${LABEL}: PASS`);
}

function selftest() {
  try {
    main();
    console.log(`${LABEL} --selftest PASS`);
  } catch (e) {
    console.error(`${LABEL} --selftest FAIL`, e);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest") || !process.argv.includes("--check-only")) {
  selftest();
}
