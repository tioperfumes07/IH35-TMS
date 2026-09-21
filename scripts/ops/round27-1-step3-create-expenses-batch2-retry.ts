#!/usr/bin/env tsx
// ROUND 27.1/28 STEP 3, batch 2 retry — the 13 EXPENSES-table lines from
// round27-1-step3-create-expenses-batch2.ts that BLOCKED live on unit_id_required. Root cause,
// verified live: these 6 loads (13585, 13601, 13606, 13605, 13607, 13608) were booked by CC-1's
// Step 1 bookLoad pass with a driver but NO assigned_unit_id (dispatch.load_assignment_history
// shows new_unit_id=null on every one of these loads' creation events) -- the same disclosed
// "unit never bound at book time" infra gap already named for driver-pay/mileage. The expenses
// route (unlike fuel/transactions) hard-requires a costable truck even when load_id is given.
//
// Fix: resolve unit_id directly, not guessed -- each settlement's own document prints
// "Load NNNNN   Truck TNNN / Trailer ..." per load line (verified against
// ~/Downloads/_st_txt/Driver_Settlement_<doc>.txt), so the truck is read from the SAME document
// that names the expense, not assumed from the settlement's single header truck. All 6 resolved
// units verified live in mdata.units, all currently_leased_to_company_id = USMCA.
//
// Same real POST /api/v1/expenses route via app.inject(), same as the parent batch2 script.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerExpenseRoutes } from "../../apps/backend/src/accounting/expenses.routes.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const BANK_ACCOUNT_ID = "c7af1219-f6a6-4169-a2d8-8f556fb0c2f3";
const FUEL_DIESEL_ACCOUNT_ID = "353fbd5b-d39c-4709-ac19-60cae52018f7";
const TOLLS_SCALES_ACCOUNT_ID = "4a0a5b88-3f56-4dc7-853c-37071089315a";
const LUMPER_ACCOUNT_ID = "b029d12d-f0b2-4f69-9e84-5df91a954c77";
const OTHER_OPEX_ACCOUNT_ID = "ba323ec8-78fd-4a4d-a520-36e589448673";

function accountForExpenseDescription(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("def") || d.includes("reefer diesel") || d.includes("fuel")) return FUEL_DIESEL_ACCOUNT_ID;
  if (d.includes("scale") || d.includes("toll") || d.includes("washout") || d.includes("wash")) return TOLLS_SCALES_ACCOUNT_ID;
  if (d.includes("lumper")) return LUMPER_ACCOUNT_ID;
  return OTHER_OPEX_ACCOUNT_ID;
}

// unit_id resolved live per load's own settlement-document truck line (see header comment)
const UNIT_T156 = "a10cd288-f599-4016-a8b4-6d70e33f3925"; // load 13585
const UNIT_T176 = "f439def3-05ac-42cf-829b-2b66ecf85a32"; // load 13601
const UNIT_T152 = "19d29860-9753-4376-93c4-dc963cc86483"; // load 13606
const UNIT_T168 = "9aae52c1-7f45-4074-a39c-607dbdfb5f81"; // load 13607
const UNIT_T177 = "e15c43f8-3c61-4d1c-be67-05a489c3e622"; // load 13608
const UNIT_T171 = "033dcdff-98c7-4b2e-8db3-2c94519dbc89"; // load 13605

type Item = {
  doc: string;
  loadNumber: string;
  loadId: string;
  unitId: string;
  date: string;
  amountCents: number;
  vendorId: string;
  description: string;
  invoice: string | null;
  memo: string;
  isCompanyExpense: boolean;
};

const LOVES_VENDOR = "5a529e97-5af6-4874-89c0-f300715101f2";

const ITEMS: Item[] = [
  { doc: "5807", loadNumber: "13585", loadId: "d603567d-3f8c-4f97-a116-729e4378db65", unitId: UNIT_T156, date: "2026-09-06", amountCents: 56000, vendorId: LOVES_VENDOR, description: "Warehouse-Lumper Fee Expense", invoice: "713028966", memo: "Warehouse-Lumper Fee Expense — LOVES — inv 713028966 — 2026-09-06 — $560.00 (settlement 5807)", isCompanyExpense: true },
  { doc: "5807", loadNumber: "13585", loadId: "d603567d-3f8c-4f97-a116-729e4378db65", unitId: UNIT_T156, date: "2026-09-06", amountCents: 3406, vendorId: LOVES_VENDOR, description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99585760", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99585760 — 2026-09-06 — $34.06 (settlement 5807)", isCompanyExpense: true },
  { doc: "5807", loadNumber: "13585", loadId: "d603567d-3f8c-4f97-a116-729e4378db65", unitId: UNIT_T156, date: "2026-09-09", amountCents: 6000, vendorId: LOVES_VENDOR, description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99598463", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99598463 — 2026-09-09 — $60.00 (settlement 5807)", isCompanyExpense: true },
  { doc: "5808", loadNumber: "13601", loadId: "8df416db-63b3-4497-bbd2-19f4cb355d72", unitId: UNIT_T176, date: "2026-09-16", amountCents: 4344, vendorId: LOVES_VENDOR, description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99476767", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99476767 — 2026-09-16 — $43.44 (settlement 5808)", isCompanyExpense: true },
  { doc: "5808", loadNumber: "13601", loadId: "8df416db-63b3-4497-bbd2-19f4cb355d72", unitId: UNIT_T176, date: "2026-09-17", amountCents: 3426, vendorId: LOVES_VENDOR, description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99119426", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99119426 — 2026-09-17 — $34.26 (settlement 5808)", isCompanyExpense: true },
  { doc: "5809", loadNumber: "13606", loadId: "6f76f0eb-e674-455c-95e3-c483ff9cf487", unitId: UNIT_T152, date: "2026-09-17", amountCents: 3690, vendorId: LOVES_VENDOR, description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99882087", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99882087 — 2026-09-17 — $36.90 (settlement 5809)", isCompanyExpense: true },
  { doc: "5813", loadNumber: "13607", loadId: "65b7edb1-fe70-4e9d-9451-969c2770e9bc", unitId: UNIT_T168, date: "2026-09-18", amountCents: 2509, vendorId: LOVES_VENDOR, description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "3557619", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 3557619 — 2026-09-18 — $25.09 (settlement 5813)", isCompanyExpense: true },
  { doc: "5813", loadNumber: "13607", loadId: "65b7edb1-fe70-4e9d-9451-969c2770e9bc", unitId: UNIT_T168, date: "2026-09-19", amountCents: 2194, vendorId: LOVES_VENDOR, description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "2313445", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 2313445 — 2026-09-19 — $21.94 (settlement 5813)", isCompanyExpense: true },
  { doc: "5813", loadNumber: "13607", loadId: "65b7edb1-fe70-4e9d-9451-969c2770e9bc", unitId: UNIT_T168, date: "2026-09-20", amountCents: 1948, vendorId: LOVES_VENDOR, description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "1047573", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 1047573 — 2026-09-20 — $19.48 (settlement 5813)", isCompanyExpense: true },
  { doc: "5814", loadNumber: "13608", loadId: "0e35b122-d643-411c-bac0-50f78690e507", unitId: UNIT_T177, date: "2026-09-19", amountCents: 3797, vendorId: LOVES_VENDOR, description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99479001", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99479001 — 2026-09-19 — $37.97 (settlement 5814)", isCompanyExpense: true },
  { doc: "5814", loadNumber: "13608", loadId: "0e35b122-d643-411c-bac0-50f78690e507", unitId: UNIT_T177, date: "2026-09-21", amountCents: 3458, vendorId: LOVES_VENDOR, description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99549704", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99549704 — 2026-09-21 — $34.58 (settlement 5814)", isCompanyExpense: true },
  { doc: "5815", loadNumber: "13605", loadId: "454bb0c5-5ec8-45b0-ab33-806fa3197d2e", unitId: UNIT_T171, date: "2026-09-15", amountCents: 3649, vendorId: LOVES_VENDOR, description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99546338", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99546338 — 2026-09-15 — $36.49 (settlement 5815)", isCompanyExpense: true },
  { doc: "5815", loadNumber: "13605", loadId: "454bb0c5-5ec8-45b0-ab33-806fa3197d2e", unitId: UNIT_T171, date: "2026-09-16", amountCents: 1961, vendorId: LOVES_VENDOR, description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99155958", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99155958 — 2026-09-16 — $19.61 (settlement 5815)", isCompanyExpense: true },
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
    console.log(`${executeFlag ? "CREATE" : "DRY-RUN"} ${item.doc} load ${item.loadNumber} (unit ${item.unitId}) "${item.description}" $${(item.amountCents / 100).toFixed(2)}`);
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
        vendor_document_number: item.invoice ? `${item.invoice}-${item.doc}-${item.amountCents}` : null,
        load_id: item.loadId,
        unit_id: item.unitId,
        is_company_expense: item.isCompanyExpense,
        is_reimbursable: false,
      },
    });
    if (res.statusCode === 409 && res.body.includes("duplicate_vendor_document_number")) {
      alreadyExisted += 1;
      console.log("  already exists, skipped");
    } else if (res.statusCode >= 300) {
      blocked += 1;
      console.error(`  BLOCKED ${res.statusCode} ${res.body}`);
    } else {
      created += 1;
      createdCents += item.amountCents;
    }
  }

  console.log(`\n${executeFlag ? "EXECUTE" : "DRY RUN"} done: ${ITEMS.length} items -- created ${created} ($${(createdCents / 100).toFixed(2)}), already existed ${alreadyExisted}, blocked ${blocked}`);
  if (blocked > 0) process.exitCode = 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
