#!/usr/bin/env node
/**
 * B-4 CHECK CREATOR + BILL PAYMENT — ORDERS-2026-10-01-BANKING-REGISTER-SET §9/§10/§13–§15.
 * Asserts QBO Write Check chrome on the existing engine: Who did you pay?, Add to Check /
 * Outstanding Transactions, Restore draft, Order checks, Make recurring (expense template).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-b4-check-creator";

const FORM = "apps/frontend/src/components/checks/WriteCheckForm.tsx";
const CREATE = "apps/frontend/src/pages/accounting/checks/CheckCreatePage.tsx";
const TOPBAR = "apps/frontend/src/components/Topbar.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(src, needle, where) {
  if (!src.includes(needle)) throw new Error(`${where}: missing ${JSON.stringify(needle)}`);
}

function main() {
  const form = read(FORM);
  const create = read(CREATE);
  const topbar = read(TOPBAR);

  assertIncludes(form, 'data-b4-check-creator="1"', FORM);
  assertIncludes(form, 'data-b4-who-did-you-pay="1"', FORM);
  assertIncludes(form, "Who did you pay?", FORM);
  assertIncludes(form, 'data-b4-add-to-check="1"', FORM);
  assertIncludes(form, "Add to Check", FORM);
  assertIncludes(form, "Outstanding Transactions", FORM);
  assertIncludes(form, 'label: "Open balance"', FORM);
  assertIncludes(form, 'label: "Payment"', FORM);
  assertIncludes(form, 'data-b4-amount-to-apply="1"', FORM);
  assertIncludes(form, "Amount to Apply:", FORM);
  // BANK-F91033 / F91038 — Amount to Credit is live; Save allowed with credit (vendor_credit mint on pay-bills)
  assertIncludes(form, 'data-b4-amount-to-credit="1"', FORM);
  assertIncludes(form, "Amount to Credit:", FORM);
  assertIncludes(form, "billPaymentCreditCents", FORM);
  assertIncludes(form, "billPaymentApplyCents", FORM);
  assertIncludes(form, "formatMoneyCents(billPaymentCreditCents)", FORM);
  assertIncludes(form, "formatMoneyCents(billPaymentApplyCents)", FORM);
  assertIncludes(form, 'data-testid="b4-amount-to-credit"', FORM);
  assertIncludes(form, "billPaymentCreditCents > 0", FORM);
  assertIncludes(form, "vendor credit", FORM);
  if (form.includes("Amount to Credit: <strong>$0.00</strong>")) {
    throw new Error(`${FORM}: Amount to Credit must not be a hardcoded $0.00 stub`);
  }
  // BANK-F91029 — Clear Payment is a real button; Add all + Open on open-bill cards (ORDERS §B-4 / spec §9–§10)
  assertIncludes(form, 'data-b4-clear-payment="1"', FORM);
  assertIncludes(form, "Clear Payment", FORM);
  assertIncludes(form, "clearBillPayments", FORM);
  assertIncludes(form, 'data-b4-add-all="1"', FORM);
  assertIncludes(form, "Add all", FORM);
  assertIncludes(form, "addAllOpenBillsToPay", FORM);
  assertIncludes(form, 'data-b4-open-bill="1"', FORM);
  assertIncludes(form, 'to={`/accounting/bills/${b.id}`}', FORM);
  if (!/<button[\s\S]*data-b4-clear-payment="1"[\s\S]*Clear Payment[\s\S]*<\/button>/.test(form)) {
    throw new Error(`${FORM}: Clear Payment must be a <button>, not a dead span`);
  }
  // BANK-F91032 — Find Bill No. filters Outstanding Transactions / Add to Check (ORDERS §B-4 / QBO §10)
  assertIncludes(form, 'data-b4-find-bill-no="1"', FORM);
  assertIncludes(form, "Find Bill No.", FORM);
  assertIncludes(form, "billFindQuery", FORM);
  assertIncludes(form, "billMatchesFind", FORM);
  assertIncludes(form, "openBillsNotQueued", FORM);
  assertIncludes(form, 'data-testid="b4-find-bill-no"', FORM);
  // BANK-F91035 — Class header wired to createCheck class_id (ORDERS §B-4 / QBO check chrome)
  assertIncludes(form, 'data-b4-check-class="1"', FORM);
  assertIncludes(form, 'data-testid="b4-check-class"', FORM);
  assertIncludes(form, "class_id: classId", FORM);
  assertIncludes(form, "classesCatalogClient", FORM);
  assertIncludes(form, 'createKind="class"', FORM);
  // BANK-F91037 — Settlement No + Location (CLAIM 202615221300)
  assertIncludes(form, 'data-b4-check-settlement-no="1"', FORM);
  assertIncludes(form, 'data-testid="b4-check-settlement-no"', FORM);
  assertIncludes(form, "Settlement No.", FORM);
  assertIncludes(form, "settlement_no: settlementNo.trim() || null", FORM);
  assertIncludes(form, 'data-b4-check-location="1"', FORM);
  assertIncludes(form, 'data-testid="b4-check-location"', FORM);
  assertIncludes(form, "FuelStopLocationPicker", FORM);
  assertIncludes(form, "location_id: locationId", FORM);
  assertIncludes(form, "fuelStopOnly={false}", FORM);
  // BANK-F91039 — ORDERS §B-4 §14 driver bill = settlement chrome (NB-Load / Settlement / Truck / miles / OD / WO)
  assertIncludes(form, 'data-b4-driver-settlement-chrome="1"', FORM);
  assertIncludes(form, 'data-testid="b4-driver-settlement-chrome"', FORM);
  assertIncludes(form, "NB-Load Number", FORM);
  assertIncludes(form, "Truck / Trailer", FORM);
  assertIncludes(form, "Empty / Loaded miles", FORM);
  assertIncludes(form, "Origin → Destination", FORM);
  assertIncludes(form, "Paid to date", FORM);
  assertIncludes(form, "Open balance:", FORM);
  assertIncludes(form, "linked_settlement_display_id", FORM);
  assertIncludes(form, "linked_empty_miles", FORM);
  assertIncludes(form, "linked_trailer_number", FORM);
  // BANK-F91040 — BE listBillsByVendor projects empty / OD / trailer (not FE "—" stubs alone)
  const billsService = read("apps/backend/src/accounting/bills.service.ts");
  assertIncludes(billsService, "linked_empty_miles", "bills.service.ts");
  assertIncludes(billsService, "linked_origin", "bills.service.ts");
  assertIncludes(billsService, "linked_destination", "bills.service.ts");
  assertIncludes(billsService, "linked_trailer_number", "bills.service.ts");
  assertIncludes(billsService, "empty_miles AS linked_empty_miles", "bills.service.ts");
  assertIncludes(billsService, "origin_label AS linked_origin", "bills.service.ts");
  assertIncludes(billsService, "destination_label AS linked_destination", "bills.service.ts");
  assertIncludes(billsService, "trailer_number AS linked_trailer_number", "bills.service.ts");
  assertIncludes(billsService, "load_trailer_equipment_id", "bills.service.ts");
  assertIncludes(billsService, "dispatch.load_assignment_history", "bills.service.ts");
  assertIncludes(form, 'data-b4-restore-draft="1"', FORM);
  assertIncludes(form, "You have a draft saved. Restore draft", FORM);
  assertIncludes(form, "checkDraftStorageKey", FORM);
  assertIncludes(form, 'data-b4-order-checks="1"', FORM);
  assertIncludes(form, "Order checks", FORM);
  assertIncludes(form, 'data-b4-make-recurring="1"', FORM);
  assertIncludes(form, "Make recurring", FORM);
  // BANK-F91055 — Make recurring wired (expense template), not honest-disabled
  assertIncludes(form, 'data-testid="b4-make-recurring"', FORM);
  assertIncludes(form, "canMakeRecurring", FORM);
  assertIncludes(form, "createAccountingRecurringExpenseTemplate", FORM);
  assertIncludes(form, 'data-b4-make-recurring-modal="1"', FORM);
  assertIncludes(form, "handleMakeRecurring", FORM);
  if (/title="Make recurring is not wired for checks yet/.test(form)) {
    throw new Error(`${FORM}: Make recurring must not stay honest-disabled`);
  }
  const recurringRoutes = read("apps/backend/src/accounting/recurring-template-detail.routes.ts");
  assertIncludes(recurringRoutes, 'kind: z.literal("expense")', "recurring-template-detail.routes.ts");
  assertIncludes(recurringRoutes, "BANK-F91055", "recurring-template-detail.routes.ts");
  assertIncludes(recurringRoutes, "amount_cents", "recurring-template-detail.routes.ts");
  const recurringApi = read("apps/frontend/src/api/accountingRecurringTemplate.ts");
  assertIncludes(recurringApi, "createAccountingRecurringExpenseTemplate", "accountingRecurringTemplate.ts");
  assertIncludes(form, "Print later", FORM);
  // BANK-F91041 — ORDERS §B-4 More(Void / Delete=void / Transaction journal / Audit history)
  assertIncludes(form, 'data-b4-check-more="1"', FORM);
  assertIncludes(form, 'data-testid="b4-check-more"', FORM);
  assertIncludes(form, "MoreActionsMenu", FORM);
  assertIncludes(form, "Transaction journal", FORM);
  assertIncludes(form, "Audit history", FORM);
  assertIncludes(form, "lastSavedCheckId", FORM);
  assertIncludes(form, "lastSavedJournalEntryId", FORM);
  assertIncludes(form, "voidCheckApi", FORM);
  assertIncludes(form, "VoidReasonModal", FORM);
  assertIncludes(form, 'label: "Delete"', FORM);
  assertIncludes(form, "Save and close", FORM);
  // BANK-F91045 — ORDERS §B-4 / QBO §9–§13 [Save] [Save and close ▾] (Save and new / Save and print)
  assertIncludes(form, 'data-b4-save-and-close="1"', FORM);
  assertIncludes(form, 'data-testid="b4-save-and-close"', FORM);
  assertIncludes(form, 'data-testid="b4-save-and-close-menu"', FORM);
  assertIncludes(form, 'label: "Save and new"', FORM);
  assertIncludes(form, 'label: "Save and print"', FORM);
  assertIncludes(form, 'aria-label="Save and close options"', FORM);
  assertIncludes(form, "payCheckBills", FORM);
  assertIncludes(form, "createCheck", FORM);

  assertIncludes(create, "WriteCheckForm", CREATE);
  assertIncludes(create, "/accounting/checks/new", CREATE);

  assertIncludes(topbar, "/accounting/checks/new", TOPBAR);
  assertIncludes(topbar, "create_check", TOPBAR);

  console.log(`${LABEL}: PASS`);
}

function selftest() {
  try {
    main();
  } catch (err) {
    console.error(`${LABEL}: SELFTEST FAIL — ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
