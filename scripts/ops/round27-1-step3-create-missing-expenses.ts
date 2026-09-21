#!/usr/bin/env tsx
// ROUND 27.1/28 STEP 3 — create the genuinely missing non-Diesel EXPENSES-table lines for
// settlements 5786-5803 (excl. 5796, which the owner ruled stands exactly as printed with no
// fuel/expenses section — nothing here targets it).
//
// WHY THIS SCRIPT EXISTS: 38 of these 86 target lines were already created for the 5786-5795
// sub-range by scripts/seed-settlements-codex.ts (CODEX_SLICE = [5785..5795]) — the real,
// already-proven, owner-authorized seeding pattern for this exact class of work (NO DIRECT SQL,
// every write through the same real route the office UI calls). No equivalent slice exists for
// 5797-5803 (scripts/seed-settlements-cc-3.ts's CC3_SLICE covers [5773,5774,5775,5777,5778,5779,
// 5781,5782] instead) — that gap, not a money defect, is why those lines were missing. This script
// extends the SAME pattern (in-process Fastify inject() against the real POST /api/v1/expenses
// route — no bookLoad needed, every target load already exists) for exactly the 41 lines that
// resolve to a specific load with high confidence, using the parser's own (now-fixed) invoice
// field cross-referenced against the FUEL PURCHASES section's load-tagged invoice numbers (primary
// signal), falling back to date-window matching against a load's own fuel-purchase date range
// (secondary signal, used only when no invoice match exists) — same two signals a human would use
// reading the same document, since the EXPENSES table itself prints no load column.
//
// 7 lines are DISCLOSED, NOT INCLUDED — no invoice or date-window signal resolves them to one load
// confidently (2 "DTOPS" cross-border toll lines with no invoice at all, 2 LOVES scale lines on
// 5801 whose invoice doesn't appear anywhere in that settlement's fuel section, 1 "PAGO DE CRUCE"
// on 5790, 1 "FUEL AMERICA" washout on 5788, 1 "ROAD RANGER" fuel purchase on 5802 unrelated to
// this settlement's own two loads' dates) — left for a follow-up that can read the actual PDF
// pages side by side rather than guess.
//
// is_company_expense is set true on every line (100% of the 86-line target carries Comp. Exp.=Y —
// verified live, no exceptions found, per the OUTBOX post). is_reimbursable is left FALSE (it
// means money owed TO the driver in this schema — the opposite of what a Reimb.=Drv flag means;
// the Reimb.=Drv subset is the SAME set of transactions as the DRIVER REIMBURSEMENTS sheet,
// already correctly posted via driver_finance.settlement_lines, verified live 2 posts ago).
//
// One authorized date correction (same class as scripts/seed-settlements-codex.ts's own documented
// 99462408 fix): invoice 99460605 (settlement 5789, load 13550) prints paired fuel purchase date
// 2026-08-27 but its EXPENSES-table line prints "2026-09-27" — a month-digit typo in the source
// PDF. Corrected to 2026-08-27 to match the paired fuel line.
//
// NO NEW GL MATH: every write is the real POST /api/v1/expenses route handler via app.inject(),
// same mechanism scripts/seed-settlements-codex.ts already uses and the office UI itself calls.
//
// SAFETY: --execute requires ROUND271_ALLOW_HOST naming the exact host in DATABASE_URL. Default is
// DRY RUN. The route's own duplicate-submission guard (memo/vendor_document_number match) makes a
// re-run always safe — a repeat POST for an already-created line comes back 409 and is counted as
// already-done, not re-created.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerExpenseRoutes } from "../../apps/backend/src/accounting/expenses.routes.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // identity.users tioperfumes07@gmail.com, role Owner
const BANK_ACCOUNT_ID = "c7af1219-f6a6-4169-a2d8-8f556fb0c2f3"; // catalogs.accounts 1000 Bank of America - Operating (USMCA)
const FUEL_DIESEL_ACCOUNT_ID = "353fbd5b-d39c-4709-ac19-60cae52018f7"; // 5000 Fuel & Diesel
const TOLLS_SCALES_ACCOUNT_ID = "4a0a5b88-3f56-4dc7-853c-37071089315a"; // 5300 Tolls & Scales
const TIRES_ACCOUNT_ID = "3e868fdb-7430-476f-8fcd-3d76b7356814"; // 5500 Tires
const TRUCK_REPAIRS_ACCOUNT_ID = "8fe4f37c-39ae-48df-a0f9-f43489f3df5d"; // 5400 Truck Repairs & Maintenance
const LUMPER_ACCOUNT_ID = "b029d12d-f0b2-4f69-9e84-5df91a954c77"; // Driver Trip-Lumper Reimbursement
const OTHER_OPEX_ACCOUNT_ID = "ba323ec8-78fd-4a4d-a520-36e589448673"; // 6999 Other Operating Expense

function accountForExpenseDescription(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("def") || d.includes("reefer diesel") || d.includes("fuel")) return FUEL_DIESEL_ACCOUNT_ID;
  if (d.includes("scale") || d.includes("toll") || d.includes("washout") || d.includes("wash")) return TOLLS_SCALES_ACCOUNT_ID;
  if (d.includes("tire") || d.includes("road service")) return TIRES_ACCOUNT_ID;
  if (d.includes("lumper")) return LUMPER_ACCOUNT_ID;
  return OTHER_OPEX_ACCOUNT_ID;
}

type Item = {
  doc: string;
  loadNumber: string;
  loadId: string;
  date: string;
  amountCents: number;
  vendorId: string;
  description: string;
  invoice: string | null;
  memo: string;
  isCompanyExpense: boolean;
  isReimbursableFromDriver: boolean;
};

const ITEMS: Item[] = [
  { doc: "5786", loadNumber: "13533", loadId: "8904580d-6158-4491-9fde-51f1cbbe3fb4", date: "2026-08-21", amountCents: 3269, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99222422", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99222422 — 2026-08-21 — $32.69 (settlement 5786)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5786", loadNumber: "13533", loadId: "8904580d-6158-4491-9fde-51f1cbbe3fb4", date: "2026-08-20", amountCents: 1525, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Scale Expense:OTR-Scale Expense", invoice: "1107881", memo: "Scale Expense:OTR-Scale Expense — LOVES — inv 1107881 — 2026-08-20 — $15.25 (settlement 5786)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5787", loadNumber: "13555", loadId: "c7fa57b9-19d6-4c73-8fdd-143b0ad134a4", date: "2026-08-20", amountCents: 2492, vendorId: "62dd25a7-460e-4fd0-b4f7-d80ec59fd8a7", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "6610677", memo: "Fuel-DEF-Diesel Exhaust Fluid — PILOT — inv 6610677 — 2026-08-20 — $24.92 (settlement 5787)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5787", loadNumber: "13555", loadId: "c7fa57b9-19d6-4c73-8fdd-143b0ad134a4", date: "2026-08-20", amountCents: 1525, vendorId: "62dd25a7-460e-4fd0-b4f7-d80ec59fd8a7", description: "Scale Expense:OTR-Scale Expense", invoice: "6232741", memo: "Scale Expense:OTR-Scale Expense — PILOT — inv 6232741 — 2026-08-20 — $15.25 (settlement 5787)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5787", loadNumber: "13555", loadId: "c7fa57b9-19d6-4c73-8fdd-143b0ad134a4", date: "2026-08-21", amountCents: 2482, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "2244651", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 2244651 — 2026-08-21 — $24.82 (settlement 5787)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5788", loadNumber: "13539", loadId: "b7a92e7f-93a5-41f8-88ad-f5536eaf9023", date: "2026-08-21", amountCents: 3166, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: null, memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv no-invoice — 2026-08-21 — $31.66 (settlement 5788)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5788", loadNumber: "13539", loadId: "b7a92e7f-93a5-41f8-88ad-f5536eaf9023", date: "2026-08-22", amountCents: 2112, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: null, memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv no-invoice — 2026-08-22 — $21.12 (settlement 5788)", isCompanyExpense: true, isReimbursableFromDriver: false },
  // EXP-DATE-TYPO (same class as the codex slice's own documented 99462408 correction): invoice
  // 99460605's paired fuel purchase prints 2026-08-27 (Company_Settlement_5789.txt:39); this
  // EXPENSES-table line for the SAME invoice prints "2026-09-27" -- a month-digit print typo in
  // the source document. Corrected to 2026-08-27 to match the paired fuel line, not invented.
  { doc: "5789", loadNumber: "13550", loadId: "47c98671-d21d-4613-9faf-832030ab0798", date: "2026-08-27", amountCents: 4238, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99460605", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99460605 — 2026-08-27 — $42.38 (settlement 5789)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5790", loadNumber: "13542", loadId: "e351668f-0e49-458f-b869-0efd9b55e1e1", date: "2026-08-23", amountCents: 4426, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99988783", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99988783 — 2026-08-23 — $44.26 (settlement 5790)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5790", loadNumber: "13542", loadId: "e351668f-0e49-458f-b869-0efd9b55e1e1", date: "2026-08-26", amountCents: 4091, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99530096", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99530096 — 2026-08-26 — $40.91 (settlement 5790)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5790", loadNumber: "13542", loadId: "e351668f-0e49-458f-b869-0efd9b55e1e1", date: "2026-08-26", amountCents: 1081, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99600926", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99600926 — 2026-08-26 — $10.81 (settlement 5790)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5790", loadNumber: "13554", loadId: "f71c62cb-8573-4452-9917-4e072de12439", date: "2026-08-29", amountCents: 870, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99037285", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99037285 — 2026-08-29 — $8.70 (settlement 5790)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5790", loadNumber: "13554", loadId: "f71c62cb-8573-4452-9917-4e072de12439", date: "2026-08-31", amountCents: 6394, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99110970", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99110970 — 2026-08-31 — $63.94 (settlement 5790)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5794", loadNumber: "13568", loadId: "019dd038-b077-4722-a1ce-cbcc6498e9d7", date: "2026-08-31", amountCents: 4932, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Reefer Trailer-Washout Expense", invoice: "11012948", memo: "Reefer Trailer-Washout Expense — LOVES — inv 11012948 — 2026-08-31 — $49.32 (settlement 5794)", isCompanyExpense: true, isReimbursableFromDriver: true },
  { doc: "5797", loadNumber: "13577", loadId: "2c2d0ad9-125a-4015-9fea-0a5b9dc96575", date: "2026-09-03", amountCents: 3788, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "1343482", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 1343482 — 2026-09-03 — $37.88 (settlement 5797)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5797", loadNumber: "13577", loadId: "2c2d0ad9-125a-4015-9fea-0a5b9dc96575", date: "2026-09-06", amountCents: 309, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99506013", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99506013 — 2026-09-06 — $3.09 (settlement 5797)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5797", loadNumber: "13569", loadId: "b3532955-9b0a-4c07-989d-5352f574a01d", date: "2026-09-01", amountCents: 4593, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "2887867", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 2887867 — 2026-09-01 — $45.93 (settlement 5797)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5797", loadNumber: "13569", loadId: "b3532955-9b0a-4c07-989d-5352f574a01d", date: "2026-09-02", amountCents: 1295, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "1044016", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 1044016 — 2026-09-02 — $12.95 (settlement 5797)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5797", loadNumber: "13569", loadId: "b3532955-9b0a-4c07-989d-5352f574a01d", date: "2026-09-02", amountCents: 3763, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "2AS20WINDSHIELD", invoice: "1546106", memo: "2AS20WINDSHIELD — LOVES — inv 1546106 — 2026-09-02 — $37.63 (settlement 5797)", isCompanyExpense: true, isReimbursableFromDriver: true },
  { doc: "5798", loadNumber: "13572", loadId: "43809ccf-30c9-487b-bef8-28822ed83a77", date: "2026-09-02", amountCents: 2558, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "2888318", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 2888318 — 2026-09-02 — $25.58 (settlement 5798)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5798", loadNumber: "13572", loadId: "43809ccf-30c9-487b-bef8-28822ed83a77", date: "2026-09-03", amountCents: 2578, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99463584", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99463584 — 2026-09-03 — $25.78 (settlement 5798)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5799", loadNumber: "13571", loadId: "5706276a-dea9-45eb-bac1-2c8e14bda9c9", date: "2026-08-31", amountCents: 7061, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99794138", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99794138 — 2026-08-31 — $70.61 (settlement 5799)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5799", loadNumber: "13571", loadId: "5706276a-dea9-45eb-bac1-2c8e14bda9c9", date: "2026-09-03", amountCents: 3472, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99144063", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99144063 — 2026-09-03 — $34.72 (settlement 5799)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5799", loadNumber: "13571", loadId: "5706276a-dea9-45eb-bac1-2c8e14bda9c9", date: "2026-09-03", amountCents: 2173, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99466323", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99466323 — 2026-09-03 — $21.73 (settlement 5799)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5799", loadNumber: "13574", loadId: "ec9c2e04-ca3c-42fd-a93a-f433846b5a14", date: "2026-09-06", amountCents: 53126, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Road Service-Truck Tire Expense", invoice: "8031921", memo: "Road Service-Truck Tire Expense — LOVES — inv 8031921 — 2026-09-06 — $531.26 (settlement 5799)", isCompanyExpense: true, isReimbursableFromDriver: true },
  { doc: "5800", loadNumber: "13551", loadId: "7c3ab223-6fb4-416a-af9b-059403954266", date: "2026-08-29", amountCents: 1976, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "2255359", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 2255359 — 2026-08-29 — $19.76 (settlement 5800)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5800", loadNumber: "13551", loadId: "7c3ab223-6fb4-416a-af9b-059403954266", date: "2026-08-30", amountCents: 1863, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "1087729", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 1087729 — 2026-08-30 — $18.63 (settlement 5800)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5800", loadNumber: "13551", loadId: "7c3ab223-6fb4-416a-af9b-059403954266", date: "2026-08-29", amountCents: 3030, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Driver Reimbursement-Fuel-Def", invoice: "2885953", memo: "Driver Reimbursement-Fuel-Def — LOVES — inv 2885953 — 2026-08-29 — $30.30 (settlement 5800)", isCompanyExpense: true, isReimbursableFromDriver: true },
  { doc: "5800", loadNumber: "13573", loadId: "b1f6d017-b316-4ac4-b9ba-2345b9c678cd", date: "2026-09-02", amountCents: 5016, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99750084", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99750084 — 2026-09-02 — $50.16 (settlement 5800)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5800", loadNumber: "13573", loadId: "b1f6d017-b316-4ac4-b9ba-2345b9c678cd", date: "2026-09-03", amountCents: 45360, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Road Service-Trailer Tire Expense", invoice: "8150294", memo: "Road Service-Trailer Tire Expense — LOVES — inv 8150294 — 2026-09-03 — $453.60 (settlement 5800)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5801", loadNumber: "13570", loadId: "58d62a6c-46fd-4d56-ae0f-01320dbd667e", date: "2026-09-02", amountCents: 1956, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99407022", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99407022 — 2026-09-02 — $19.56 (settlement 5801)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5801", loadNumber: "13570", loadId: "58d62a6c-46fd-4d56-ae0f-01320dbd667e", date: "2026-09-02", amountCents: 1469, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99143994", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99143994 — 2026-09-02 — $14.69 (settlement 5801)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5801", loadNumber: "13580", loadId: "902b2534-802b-4892-92b5-23e007a3cd19", date: "2026-09-09", amountCents: 997, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99150047", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99150047 — 2026-09-09 — $9.97 (settlement 5801)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5801", loadNumber: "13580", loadId: "902b2534-802b-4892-92b5-23e007a3cd19", date: "2026-09-09", amountCents: 4000, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99877734", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99877734 — 2026-09-09 — $40.00 (settlement 5801)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5801", loadNumber: "13580", loadId: "902b2534-802b-4892-92b5-23e007a3cd19", date: "2026-09-08", amountCents: 1525, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Driver Reimbursement-TPE-Scale Expense", invoice: "1129293", memo: "Driver Reimbursement-TPE-Scale Expense — LOVES — inv 1129293 — 2026-09-08 — $15.25 (settlement 5801)", isCompanyExpense: true, isReimbursableFromDriver: true },
  { doc: "5802", loadNumber: "13579", loadId: "55e1b670-1201-40a8-8c48-b29d6bf73025", date: "2026-09-08", amountCents: 3830, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99034356", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99034356 — 2026-09-08 — $38.30 (settlement 5802)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5802", loadNumber: "13589", loadId: "3c5df9e4-be78-442d-b938-db31ed50bfe7", date: "2026-09-10", amountCents: 1918, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99471354", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99471354 — 2026-09-10 — $19.18 (settlement 5802)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5802", loadNumber: "13589", loadId: "3c5df9e4-be78-442d-b938-db31ed50bfe7", date: "2026-09-10", amountCents: 3011, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99186757", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99186757 — 2026-09-10 — $30.11 (settlement 5802)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5802", loadNumber: "13579", loadId: "55e1b670-1201-40a8-8c48-b29d6bf73025", date: "2026-09-08", amountCents: 2499, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "1ASC H1155LL HEADLIG", invoice: "2181543", memo: "1ASC H1155LL HEADLIG — LOVES — inv 2181543 — 2026-09-08 — $24.99 (settlement 5802)", isCompanyExpense: true, isReimbursableFromDriver: true },
  { doc: "5803", loadNumber: "13564", loadId: "f0d40e79-4f7a-4b64-947a-77677ef3e4fc", date: "2026-09-02", amountCents: 2041, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99407029", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99407029 — 2026-09-02 — $20.41 (settlement 5803)", isCompanyExpense: true, isReimbursableFromDriver: false },
  { doc: "5803", loadNumber: "13564", loadId: "f0d40e79-4f7a-4b64-947a-77677ef3e4fc", date: "2026-09-02", amountCents: 1695, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99144054", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99144054 — 2026-09-02 — $16.95 (settlement 5803)", isCompanyExpense: true, isReimbursableFromDriver: false },
];

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (executeFlag && !process.env.ROUND271_ALLOW_HOST) {
    throw new Error("ABORT: --execute requires ROUND271_ALLOW_HOST to name the exact host in DATABASE_URL.");
  }
  if (executeFlag && !url.includes(process.env.ROUND271_ALLOW_HOST!)) {
    throw new Error("ABORT: DATABASE_URL does not match ROUND271_ALLOW_HOST -- refusing to execute.");
  }

  const pool = new pg.Pool({ connectionString: url, max: 3 });
  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerExpenseRoutes(a as never);
  });
  const authHeader = {
    "x-test-auth": Buffer.from(
      JSON.stringify({ id: OWNER_USER_ID, role: "Owner", email: "tioperfumes07@gmail.com" }),
      "utf8"
    ).toString("base64url"),
  };

  let created = 0;
  let alreadyExisted = 0;
  let blocked = 0;
  let createdCents = 0;

  for (const item of ITEMS) {
    console.log(`${executeFlag ? "CREATE" : "DRY-RUN"} ${item.doc} load ${item.loadNumber} "${item.description}" $${(item.amountCents / 100).toFixed(2)}`);
    if (!executeFlag) continue;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: authHeader,
      payload: {
        operating_company_id: USMCA_COMPANY_ID,
        category_account_id: accountForExpenseDescription(item.description),
        payment_account_uuid: BANK_ACCOUNT_ID,
        expense_date: item.date,
        amount_cents: item.amountCents,
        vendor_uuid: item.vendorId,
        memo: item.memo,
        vendor_document_number: item.invoice ? `${item.invoice}-L${item.loadNumber}-${item.amountCents}` : null,
        load_id: item.loadId,
        is_company_expense: item.isCompanyExpense,
        is_reimbursable: false,
      },
    });
    if (res.statusCode === 409 && res.body.includes("duplicate_vendor_document_number")) {
      alreadyExisted += 1;
    } else if (res.statusCode >= 300) {
      blocked += 1;
      console.error(`  BLOCKED ${res.statusCode} ${res.body}`);
    } else {
      created += 1;
      createdCents += item.amountCents;
    }
  }

  console.log(
    `\n${executeFlag ? "EXECUTE" : "DRY RUN"} done: ${ITEMS.length} items -- created ${created} ($${(createdCents / 100).toFixed(2)}), already existed ${alreadyExisted}, blocked ${blocked}`
  );
  await pool.end();
  if (blocked > 0) process.exitCode = 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
