#!/usr/bin/env tsx
// ROUND 27.1/28 STEP 3 — the 7 EXPENSES-table lines from the 5786-5803 scope that no invoice or
// date-window signal could attribute to one specific load, ruled by the Lead: post them at the
// settlement level with NO load_id, each carrying the real load_exemption_reason escape hatch
// (LV-G18-INERT-ON-EXPENSE-LINES, expenses.routes.ts, >=20-char floor matching
// accounting.enforce_load_fk_invariant()'s own DB-level floor) rather than guessing a load. A real
// expense with an honest "no load attribution" note beats a missing expense.
//
// The 3 DTOPS lines print no invoice number at all on the document -- that is how DTOPS prints,
// not a parse failure. "PAGO DE CRUCE T174" names truck T174, recorded in the note, never turned
// into a load link.
//
// Every write is the real POST /api/v1/expenses route via app.inject(), same as
// scripts/ops/round27-1-step3-create-missing-expenses.ts and scripts/seed-settlements-codex.ts.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerExpenseRoutes } from "../../apps/backend/src/accounting/expenses.routes.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const OTHER_OPEX_ACCOUNT_ID = "ba323ec8-78fd-4a4d-a520-36e589448673"; // 6999 Other Operating Expense
const TOLLS_SCALES_ACCOUNT_ID = "4a0a5b88-3f56-4dc7-853c-37071089315a"; // 5300 Tolls & Scales
const FUEL_DIESEL_ACCOUNT_ID = "353fbd5b-d39c-4709-ac19-60cae52018f7"; // 5000 Fuel & Diesel
const BANK_ACCOUNT_ID = "c7af1219-f6a6-4169-a2d8-8f556fb0c2f3";

const DTOPS_VENDOR = "5c557250-fb0b-433a-acf0-3ca123266c29";
const FUEL_AMERICA_VENDOR = "aece329d-ef9d-4622-8281-1f1051ce8bf4";
const LOVES_VENDOR = "5a529e97-5af6-4874-89c0-f300715101f2";
const ROAD_RANGER_VENDOR = "185f7c61-b60f-45f3-9e94-1748ef45ff74";

type Item = {
  doc: string;
  date: string;
  amountCents: number;
  vendorId: string;
  unitId: string;
  description: string;
  invoice: string | null;
  categoryAccountId: string;
  memo: string;
  exemptionReason: string;
};

// Unit resolved from each settlement's own printed "Trk: TNNN" header -- the one truck the whole
// document is for -- since the real route requires SOME truck to cost an expense against
// (unit_id_required, found live on the first --execute attempt).
const UNIT_T164 = "478d9f14-b2fd-4cea-a51e-76ec30c39ec7";
const UNIT_T156 = "a10cd288-f599-4016-a8b4-6d70e33f3925";
const UNIT_T175 = "507921c7-ab1c-4fa7-bd7c-7f42552f7423";
const UNIT_T176 = "f439def3-05ac-42cf-829b-2b66ecf85a32";

const ITEMS: Item[] = [
  {
    doc: "5787",
    date: "2026-08-18",
    amountCents: 1345,
    vendorId: DTOPS_VENDOR,
    unitId: UNIT_T164,
    description: "Driver Reimbursement-TPE-Toll Expense",
    invoice: null,
    categoryAccountId: TOLLS_SCALES_ACCOUNT_ID,
    memo: "Driver Reimbursement-TPE-Toll Expense — DTOPS — inv no-invoice — 2026-08-18 — $13.45 (settlement 5787)",
    exemptionReason:
      "AlwaysTrack Company Settlement 5787 page 1, EXPENSES table prints no load column and this line's own printed columns give no invoice/reference to cross-match against the settlement's FUEL PURCHASES load-tagged invoices. Not guessing a load per Lead ruling 2026-09-21.",
  },
  {
    doc: "5788",
    date: "2026-08-18",
    amountCents: 2080,
    vendorId: DTOPS_VENDOR,
    unitId: UNIT_T156,
    description: "OTR-Mexico Tolls & Intl Bridge Expense",
    invoice: null,
    categoryAccountId: TOLLS_SCALES_ACCOUNT_ID,
    memo: "OTR-Mexico Tolls & Intl Bridge Expense — DTOPS — inv no-invoice — 2026-08-18 — $20.80 (settlement 5788)",
    exemptionReason:
      "AlwaysTrack Company Settlement 5788 page 1, EXPENSES table prints no load column and this line's own printed columns give no invoice/reference to cross-match against the settlement's FUEL PURCHASES load-tagged invoices. Not guessing a load per Lead ruling 2026-09-21.",
  },
  {
    doc: "5788",
    date: "2026-08-20",
    amountCents: 5196,
    vendorId: FUEL_AMERICA_VENDOR,
    unitId: UNIT_T156,
    description: "Reefer Trailer-Washout Expense",
    invoice: "01041382",
    categoryAccountId: TOLLS_SCALES_ACCOUNT_ID,
    memo: "Reefer Trailer-Washout Expense — FUEL AMERICA — inv 01041382 — 2026-08-20 — $51.96 (settlement 5788)",
    exemptionReason:
      "AlwaysTrack Company Settlement 5788 page 1, EXPENSES table prints no load column; invoice 01041382 appears nowhere in this settlement's own FUEL PURCHASES load-tagged invoices. Not guessing a load per Lead ruling 2026-09-21.",
  },
  {
    doc: "5790",
    date: "2026-08-22",
    amountCents: 2080,
    vendorId: DTOPS_VENDOR,
    unitId: UNIT_T175,
    description: "PAGO DE CRUCE T174",
    invoice: null,
    categoryAccountId: TOLLS_SCALES_ACCOUNT_ID,
    memo: "PAGO DE CRUCE T174 — DTOPS — inv no-invoice — 2026-08-22 — $20.80 (settlement 5790)",
    exemptionReason:
      "AlwaysTrack Company Settlement 5790 page 1, EXPENSES table prints no load column. Description names truck T174 (a unit, not a load) and gives no invoice/reference to cross-match. Not turned into a load link per Lead ruling 2026-09-21.",
  },
  {
    doc: "5801",
    date: "2026-09-01",
    amountCents: 1525,
    vendorId: LOVES_VENDOR,
    unitId: UNIT_T164,
    description: "Driver Reimbursement-TPE-Scale Expense",
    invoice: "2050188",
    categoryAccountId: TOLLS_SCALES_ACCOUNT_ID,
    memo: "Driver Reimbursement-TPE-Scale Expense — LOVES — inv 2050188 — 2026-09-01 — $15.25 (settlement 5801)",
    exemptionReason:
      "AlwaysTrack Company Settlement 5801 page 1, EXPENSES table prints no load column; invoice 2050188 appears nowhere in this settlement's own FUEL PURCHASES load-tagged invoices. Not guessing a load per Lead ruling 2026-09-21.",
  },
  {
    doc: "5801",
    date: "2026-09-01",
    amountCents: 525,
    vendorId: LOVES_VENDOR,
    unitId: UNIT_T164,
    description: "Driver Reimbursement-TPE-Scale Expense",
    invoice: "1926967",
    categoryAccountId: TOLLS_SCALES_ACCOUNT_ID,
    memo: "Driver Reimbursement-TPE-Scale Expense — LOVES — inv 1926967 — 2026-09-01 — $5.25 (settlement 5801)",
    exemptionReason:
      "AlwaysTrack Company Settlement 5801 page 1, EXPENSES table prints no load column; invoice 1926967 appears nowhere in this settlement's own FUEL PURCHASES load-tagged invoices. Not guessing a load per Lead ruling 2026-09-21.",
  },
  {
    doc: "5802",
    date: "2026-09-05",
    amountCents: 1000,
    vendorId: ROAD_RANGER_VENDOR,
    unitId: UNIT_T176,
    description: "Gasolina para Camioneta Honda",
    invoice: "38031247",
    categoryAccountId: OTHER_OPEX_ACCOUNT_ID,
    memo: "Gasolina para Camioneta Honda — ROAD RANGER — inv 38031247 — 2026-09-05 — $10.00 (settlement 5802)",
    exemptionReason:
      "AlwaysTrack Company Settlement 5802 page 1, EXPENSES table prints no load column; this line is a company-vehicle (Honda car) gas purchase, not a load-attributable OTR expense. Not guessing a load per Lead ruling 2026-09-21.",
  },
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
  let blocked = 0;
  let createdCents = 0;

  for (const item of ITEMS) {
    console.log(`${executeFlag ? "CREATE" : "DRY-RUN"} ${item.doc} (no load) "${item.description}" $${(item.amountCents / 100).toFixed(2)}`);
    if (!executeFlag) continue;
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
        vendor_uuid: item.vendorId,
        memo: item.memo,
        vendor_document_number: item.invoice ? `${item.invoice}-${item.doc}-${item.amountCents}` : null,
        unit_id: item.unitId,
        load_exemption_reason: item.exemptionReason,
        is_company_expense: true,
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
    }
  }

  console.log(`\n${executeFlag ? "EXECUTE" : "DRY RUN"} done: ${ITEMS.length} items -- created ${created} ($${(createdCents / 100).toFixed(2)}), blocked ${blocked}`);
  if (blocked > 0) process.exitCode = 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
