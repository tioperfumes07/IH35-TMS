#!/usr/bin/env tsx
// ROUND 27.1/28 STEP 3, batch 2 -- 5 EXPENSES-table lines that were live-verified missing after the
// FUEL PURCHASES/EXPENSES section-tie re-check on 5804-5815 (each settlement's own document "EXPENSES
// ... Totals:" line asserted against live sum(accounting.expenses.total_amount_cents) grouped by the
// "(settlement DOC)" memo suffix every batch-2 expense line carries). 5 of 12 settlements were short
// by exactly the amount of one or two lines this file's parent script (round27-1-step3-create-
// expenses-batch2.ts) never wrote:
//   - 5805 short $10.00: "GASOLINA/HONDA" LOVES 2026-09-08 inv 16049982, Drv reimb marker. Company
//     vehicle (Honda car) gas, same class as the Phase-1 "Gasolina para Camioneta Honda" no-load
//     line -- posted with NO load_id, unit resolved from the settlement's own Trk: T177 header.
//   - 5808 short $65.21 (2 lines): "TRUCK WASHOUT T176" FUEL AMERICA 2026-09-18 inv 00044388 $55.21
//     names the truck directly (T176, same as this settlement's own header truck) -- no load_id,
//     same as the Phase-1 "PAGO DE CRUCE T174" precedent. "GAS/HONDA" ROAD RANGER 2026-09-12 inv
//     00034608 $10.00, Drv marker -- company vehicle gas, no load_id, same class as 5805's line.
//   - 5809 short $120.00: "Warehouse-Lumper Fee Expense" GDC GROUP LOGISTICS,INC 2026-09-18 inv
//     928526, Drv marker. Confidently load-attributed: load 13606 delivers 2026-09-18 to
//     "S/C - Operadora Orca - GDC, LAREDO, TX 78045" (Driver_Settlement_5809.txt) -- date AND vendor
//     name (GDC) both match this load's own delivery stop, no other load in this settlement touches
//     that date/vendor.
//   - 5810 short $250.00: "Warehouse-Lumper Fee Expense" TERRENCE SMITH 2026-09-14, no invoice
//     printed. Date 2026-09-14 is BOTH load 13590's delivery date and load 13599's empty-leg start
//     date at the SAME location (Quaker Valley Foods, Philadelphia PA) -- genuinely ambiguous between
//     the two loads, no invoice/reference to break the tie. Posted with NO load_id per the Lead's
//     standing ruling (never guess a load), unit resolved from the settlement's own Trk: T164 header.
//
// 2 new vendor masters (GDC GROUP LOGISTICS, TERRENCE SMITH) created first via the real
// POST /api/v1/mdata/vendors route -- searched live against mdata.vendors, neither existed.
// Every write is the real route via app.inject(), same as every other script in this ROUND.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerVendorRoutes } from "../../apps/backend/src/mdata/vendors.routes.js";
import { registerExpenseRoutes } from "../../apps/backend/src/accounting/expenses.routes.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const BANK_ACCOUNT_ID = "c7af1219-f6a6-4169-a2d8-8f556fb0c2f3";
const TOLLS_SCALES_ACCOUNT_ID = "4a0a5b88-3f56-4dc7-853c-37071089315a";
const LUMPER_ACCOUNT_ID = "b029d12d-f0b2-4f69-9e84-5df91a954c77";
const OTHER_OPEX_ACCOUNT_ID = "ba323ec8-78fd-4a4d-a520-36e589448673";

const LOVES_VENDOR = "5a529e97-5af6-4874-89c0-f300715101f2";
const ROAD_RANGER_VENDOR = "185f7c61-b60f-45f3-9e94-1748ef45ff74";
const FUEL_AMERICA_VENDOR = "aece329d-ef9d-4622-8281-1f1051ce8bf4";

const UNIT_T177 = "e15c43f8-3c61-4d1c-be67-05a489c3e622"; // 5805's own Trk header
const UNIT_T176 = "f439def3-05ac-42cf-829b-2b66ecf85a32"; // 5808's own Trk header
const UNIT_T152 = "19d29860-9753-4376-93c4-dc963cc86483"; // load 13606's own truck (5809)
const UNIT_T164 = "478d9f14-b2fd-4cea-a51e-76ec30c39ec7"; // 5810's own Trk header

const NEW_VENDORS = ["GDC GROUP LOGISTICS", "TERRENCE SMITH"];

type Item = {
  doc: string;
  date: string;
  amountCents: number;
  vendorId: string | "GDC_GROUP" | "TERRENCE_SMITH";
  loadId: string | null;
  unitId: string;
  description: string;
  invoice: string | null;
  categoryAccountId: string;
  isCompanyExpense: boolean;
  recoverFromDriver: boolean;
  exemptionReason: string | null;
};

const ITEMS: Item[] = [
  {
    doc: "5805", date: "2026-09-08", amountCents: 1000, vendorId: LOVES_VENDOR, loadId: null, unitId: UNIT_T177,
    description: "GASOLINA/HONDA", invoice: "16049982", categoryAccountId: OTHER_OPEX_ACCOUNT_ID,
    isCompanyExpense: true, recoverFromDriver: true,
    exemptionReason: "AlwaysTrack Company Settlement 5805 page 1, EXPENSES table: this line is a company-vehicle (Honda car) gas purchase, not a load-attributable OTR expense. Not guessing a load per Lead ruling 2026-09-21.",
  },
  {
    doc: "5808", date: "2026-09-18", amountCents: 5521, vendorId: FUEL_AMERICA_VENDOR, loadId: null, unitId: UNIT_T176,
    description: "TRUCK WASHOUT T176", invoice: "00044388", categoryAccountId: TOLLS_SCALES_ACCOUNT_ID,
    isCompanyExpense: true, recoverFromDriver: false,
    exemptionReason: "AlwaysTrack Company Settlement 5808 page 1, EXPENSES table: description names truck T176 directly (a unit, not a load) -- same class as the Phase-1 PAGO DE CRUCE T174 precedent. Not turned into a load link per Lead ruling 2026-09-21.",
  },
  {
    doc: "5808", date: "2026-09-12", amountCents: 1000, vendorId: ROAD_RANGER_VENDOR, loadId: null, unitId: UNIT_T176,
    description: "GAS/HONDA", invoice: "00034608", categoryAccountId: OTHER_OPEX_ACCOUNT_ID,
    isCompanyExpense: true, recoverFromDriver: true,
    exemptionReason: "AlwaysTrack Company Settlement 5808 page 1, EXPENSES table: this line is a company-vehicle (Honda car) gas purchase, not a load-attributable OTR expense. Not guessing a load per Lead ruling 2026-09-21.",
  },
  {
    doc: "5809", date: "2026-09-18", amountCents: 12000, vendorId: "GDC_GROUP", loadId: "6f76f0eb-e674-455c-95e3-c483ff9cf487", unitId: UNIT_T152,
    description: "Warehouse-Lumper Fee Expense", invoice: "928526", categoryAccountId: LUMPER_ACCOUNT_ID,
    isCompanyExpense: true, recoverFromDriver: true, exemptionReason: null,
  },
  {
    doc: "5810", date: "2026-09-14", amountCents: 25000, vendorId: "TERRENCE_SMITH", loadId: null, unitId: UNIT_T164,
    description: "Warehouse-Lumper Fee Expense", invoice: null, categoryAccountId: LUMPER_ACCOUNT_ID,
    isCompanyExpense: true, recoverFromDriver: false,
    exemptionReason: "AlwaysTrack Company Settlement 5810 page 1, EXPENSES table: date 2026-09-14 is BOTH load 13590's delivery date AND load 13599's empty-leg start date at the same location (Quaker Valley Foods, Philadelphia PA), genuinely ambiguous with no invoice/reference to break the tie. Not guessing a load per Lead ruling 2026-09-21.",
  },
];

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (executeFlag && !process.env.ROUND271_ALLOW_HOST) throw new Error("ABORT: --execute requires ROUND271_ALLOW_HOST.");
  if (executeFlag && !url.includes(process.env.ROUND271_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL mismatch.");

  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerVendorRoutes(a as never);
    await registerExpenseRoutes(a as never);
  });
  const authHeader = {
    "x-test-auth": Buffer.from(JSON.stringify({ id: OWNER_USER_ID, role: "Owner", email: "tioperfumes07@gmail.com" }), "utf8").toString("base64url"),
  };

  // Already created live in the first (partially-succeeded) --execute pass of this script --
  // verified live in mdata.vendors before hardcoding, never recreated (search-first, no dup vendor
  // masters): GDC GROUP LOGISTICS f1a3327b-571a-4b30-921e-7b377405d832, TERRENCE SMITH
  // eed0dbb4-e20e-4c92-a432-64d9519bc898.
  const vendorIds: Record<string, string> = {
    GDC_GROUP: "f1a3327b-571a-4b30-921e-7b377405d832",
    TERRENCE_SMITH: "eed0dbb4-e20e-4c92-a432-64d9519bc898",
  };

  let created = 0;
  let blocked = 0;
  let createdCents = 0;

  for (const item of ITEMS) {
    const vendorId = item.vendorId === "GDC_GROUP" || item.vendorId === "TERRENCE_SMITH" ? vendorIds[item.vendorId] : item.vendorId;
    console.log(`${executeFlag ? "CREATE" : "DRY-RUN"} ${item.doc} "${item.description}" $${(item.amountCents / 100).toFixed(2)} (load ${item.loadId ?? "NONE"}, unit ${item.unitId})`);
    if (!executeFlag) continue;
    const memo = `${item.description} — inv ${item.invoice ?? "no-invoice"} — ${item.date} — $${(item.amountCents / 100).toFixed(2)} (settlement ${item.doc})`;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: authHeader,
      payload: {
        operating_company_id: USMCA_COMPANY_ID,
        category_account_id: item.categoryAccountId,
        payment_account_uuid: BANK_ACCOUNT_ID,
        expense_date: item.date,
        amount_cents: item.amountCents,
        vendor_uuid: vendorId,
        memo,
        vendor_document_number: item.invoice ? `${item.invoice}-${item.doc}-${item.amountCents}` : null,
        load_id: item.loadId,
        unit_id: item.unitId,
        load_exemption_reason: item.loadId ? undefined : item.exemptionReason,
        is_company_expense: item.isCompanyExpense,
        is_reimbursable: false,
      },
    });
    if (res.statusCode === 409 && res.body.includes("duplicate_vendor_document_number")) {
      console.log("  already exists, skipped");
    } else if (res.statusCode >= 300) {
      blocked += 1;
      console.error(`  BLOCKED ${res.statusCode} ${res.body}`);
    } else {
      created += 1;
      createdCents += item.amountCents;
      // recover_from_driver / recover_deduction_type are not on the create route's schema --
      // same Phase-1 precedent (38-row is_company_expense + 9-row recover_from_driver direct
      // UPDATE): set directly, audited, on the row the route just created.
      if (item.recoverFromDriver) {
        const body = JSON.parse(res.body);
        const newId = body.expense_id ?? body.id ?? body.expense?.id ?? body.data?.id;
        if (!newId) throw new Error(`ABORT: no id in expense create response to apply recover_from_driver: ${res.body}`);
        console.log(`  -> ${newId} (recover_from_driver flag pending direct UPDATE)`);
      } else {
        const body = JSON.parse(res.body);
        console.log(`  -> ${body.expense_id ?? body.id}`);
      }
    }
  }

  console.log(`\n${executeFlag ? "EXECUTE" : "DRY RUN"} done: ${ITEMS.length} items -- created ${created} ($${(createdCents / 100).toFixed(2)}), blocked ${blocked}`);
  if (blocked > 0) process.exitCode = 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
