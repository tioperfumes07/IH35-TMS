#!/usr/bin/env tsx
// ROUND 27.1/28 STEP 3, batch 2 — create the 68 confidently-load-attributed EXPENSES-table lines
// for settlements 5804-5816 (excl. 5816, which carries no fuel/expenses). Same real-route pattern
// as scripts/ops/round27-1-step3-create-missing-expenses.ts: invoice cross-referenced against the
// FUEL PURCHASES section's load-tagged invoices, falling back to date-window matching.
// is_company_expense set true per the document's own Comp. Exp.=Y flag (100% of this batch's
// target, same as the first scope -- no exceptions). One line with a BLANK vendor column on the
// source document ("Warehouse-Lumper Fee Expense" $308.00, settlement 5815) is excluded here, same
// as scripts/seed-settlements-codex.ts's own "never inventing a vendor" rule -- reported separately.
//
// 3 new vendor masters (TRUCK WASH HEBRON, PRIME INT, Smithfield Foods Inc) were created via the
// real POST /api/v1/mdata/vendors route first (scripts/ops/round27-1-step3-create-vendors-batch2.ts,
// searched live against mdata.vendors before creating -- none existed).
//
// Every write is the real POST /api/v1/expenses route via app.inject().
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
const TIRES_ACCOUNT_ID = "3e868fdb-7430-476f-8fcd-3d76b7356814";
const LUMPER_ACCOUNT_ID = "b029d12d-f0b2-4f69-9e84-5df91a954c77";
const OTHER_OPEX_ACCOUNT_ID = "ba323ec8-78fd-4a4d-a520-36e589448673";

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
};

const ITEMS: Item[] = [
  { doc: "5804", loadNumber: "13576", loadId: "51e2d71b-c384-4b24-b5b9-f471a4da9dd1", date: "2026-09-08", amountCents: 4774, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99540434", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99540434 — 2026-09-08 — $47.74 (settlement 5804)", isCompanyExpense: true },
  { doc: "5804", loadNumber: "13576", loadId: "51e2d71b-c384-4b24-b5b9-f471a4da9dd1", date: "2026-09-05", amountCents: 1525, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Driver Reimbursement-TPE-Scale Expense", invoice: "1929303", memo: "Driver Reimbursement-TPE-Scale Expense — LOVES — inv 1929303 — 2026-09-05 — $15.25 (settlement 5804)", isCompanyExpense: true },
  { doc: "5804", loadNumber: "13594", loadId: "6c08ae39-5079-4b23-ab16-8b044add7619", date: "2026-09-11", amountCents: 3589, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99478021", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99478021 — 2026-09-11 — $35.89 (settlement 5804)", isCompanyExpense: true },
  { doc: "5804", loadNumber: "13594", loadId: "6c08ae39-5079-4b23-ab16-8b044add7619", date: "2026-09-12", amountCents: 2467, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99681509", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99681509 — 2026-09-12 — $24.67 (settlement 5804)", isCompanyExpense: true },
  { doc: "5804", loadNumber: "13576", loadId: "51e2d71b-c384-4b24-b5b9-f471a4da9dd1", date: "2026-09-10", amountCents: 6460, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Road Service-Trailer Tire Expense", invoice: "2163923", memo: "Road Service-Trailer Tire Expense — LOVES — inv 2163923 — 2026-09-10 — $64.60 (settlement 5804)", isCompanyExpense: true },
  { doc: "5805", loadNumber: "13582", loadId: "c750b5ec-10c3-4a78-a70a-05afa560829e", date: "2026-09-09", amountCents: 2884, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99540777", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99540777 — 2026-09-09 — $28.84 (settlement 5805)", isCompanyExpense: true },
  { doc: "5805", loadNumber: "13582", loadId: "c750b5ec-10c3-4a78-a70a-05afa560829e", date: "2026-09-09", amountCents: 1741, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99378218", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99378218 — 2026-09-09 — $17.41 (settlement 5805)", isCompanyExpense: true },
  { doc: "5805", loadNumber: "13582", loadId: "c750b5ec-10c3-4a78-a70a-05afa560829e", date: "2026-09-10", amountCents: 2965, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99471980", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99471980 — 2026-09-10 — $29.65 (settlement 5805)", isCompanyExpense: true },
  { doc: "5805", loadNumber: "13592", loadId: "d706f493-de13-4d8c-8bf0-4a889e3f87fb", date: "2026-09-12", amountCents: 8769, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Driver Reimbursement-Fuel-Def", invoice: "99473683", memo: "Driver Reimbursement-Fuel-Def — LOVES — inv 99473683 — 2026-09-12 — $87.69 (settlement 5805)", isCompanyExpense: true },
  { doc: "5806", loadNumber: "13581", loadId: "639b38d8-4c5e-42ba-9d7f-2d5aeb3f735f", date: "2026-09-08", amountCents: 2695, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99540441", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99540441 — 2026-09-08 — $26.95 (settlement 5806)", isCompanyExpense: true },
  { doc: "5806", loadNumber: "13581", loadId: "639b38d8-4c5e-42ba-9d7f-2d5aeb3f735f", date: "2026-09-09", amountCents: 1703, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99149988", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99149988 — 2026-09-09 — $17.03 (settlement 5806)", isCompanyExpense: true },
  { doc: "5806", loadNumber: "13581", loadId: "639b38d8-4c5e-42ba-9d7f-2d5aeb3f735f", date: "2026-09-10", amountCents: 3044, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99471824", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99471824 — 2026-09-10 — $30.44 (settlement 5806)", isCompanyExpense: true },
  { doc: "5806", loadNumber: "13591", loadId: "10234bcb-933e-422c-9924-630a7f2a893f", date: "2026-09-11", amountCents: 5231, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "2680400", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 2680400 — 2026-09-11 — $52.31 (settlement 5806)", isCompanyExpense: true },
  { doc: "5806", loadNumber: "13591", loadId: "10234bcb-933e-422c-9924-630a7f2a893f", date: "2026-09-12", amountCents: 1452, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "1498362", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 1498362 — 2026-09-12 — $14.52 (settlement 5806)", isCompanyExpense: true },
  { doc: "5806", loadNumber: "13591", loadId: "10234bcb-933e-422c-9924-630a7f2a893f", date: "2026-09-13", amountCents: 1836, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "1602944", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 1602944 — 2026-09-13 — $18.36 (settlement 5806)", isCompanyExpense: true },
  { doc: "5807", loadNumber: "13578", loadId: "dc119bec-afc8-4b81-952c-6eb84ffa8329", date: "2026-09-04", amountCents: 4871, vendorId: "aece329d-ef9d-4622-8281-1f1051ce8bf4", description: "Reefer Trailer-Washout Expense", invoice: "01043451", memo: "Reefer Trailer-Washout Expense — FUEL AMERICA — inv 01043451 — 2026-09-04 — $48.71 (settlement 5807)", isCompanyExpense: true },
  { doc: "5807", loadNumber: "13578", loadId: "dc119bec-afc8-4b81-952c-6eb84ffa8329", date: "2026-09-04", amountCents: 188, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "2889213", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 2889213 — 2026-09-04 — $1.88 (settlement 5807)", isCompanyExpense: true },
  { doc: "5807", loadNumber: "13578", loadId: "dc119bec-afc8-4b81-952c-6eb84ffa8329", date: "2026-09-05", amountCents: 2100, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99355909", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99355909 — 2026-09-05 — $21.00 (settlement 5807)", isCompanyExpense: true },
  { doc: "5807", loadNumber: "13585", loadId: "d603567d-3f8c-4f97-a116-729e4378db65", date: "2026-09-06", amountCents: 56000, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Warehouse-Lumper Fee Expense", invoice: "713028966", memo: "Warehouse-Lumper Fee Expense — LOVES — inv 713028966 — 2026-09-06 — $560.00 (settlement 5807)", isCompanyExpense: true },
  { doc: "5807", loadNumber: "13587", loadId: "0b3589e5-f09d-4b2b-9b2a-78134d2b2839", date: "2026-09-10", amountCents: 4725, vendorId: "4bd7da29-40ab-4047-88e8-5e87be28333f", description: "Reefer Trailer-Washout Expense", invoice: null, memo: "Reefer Trailer-Washout Expense — TRUCK WASH HEBRON — inv no-invoice — 2026-09-10 — $47.25 (settlement 5807)", isCompanyExpense: true },
  { doc: "5807", loadNumber: "13585", loadId: "d603567d-3f8c-4f97-a116-729e4378db65", date: "2026-09-06", amountCents: 3406, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99585760", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99585760 — 2026-09-06 — $34.06 (settlement 5807)", isCompanyExpense: true },
  { doc: "5807", loadNumber: "13585", loadId: "d603567d-3f8c-4f97-a116-729e4378db65", date: "2026-09-09", amountCents: 6000, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99598463", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99598463 — 2026-09-09 — $60.00 (settlement 5807)", isCompanyExpense: true },
  { doc: "5808", loadNumber: "13597", loadId: "c4762193-3458-4a06-ae3c-f0dcd692c6b0", date: "2026-09-13", amountCents: 5857, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99543794", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99543794 — 2026-09-13 — $58.57 (settlement 5808)", isCompanyExpense: true },
  { doc: "5808", loadNumber: "13597", loadId: "c4762193-3458-4a06-ae3c-f0dcd692c6b0", date: "2026-09-14", amountCents: 2375, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99509456", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99509456 — 2026-09-14 — $23.75 (settlement 5808)", isCompanyExpense: true },
  { doc: "5808", loadNumber: "13597", loadId: "c4762193-3458-4a06-ae3c-f0dcd692c6b0", date: "2026-09-14", amountCents: 1457, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99475285", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99475285 — 2026-09-14 — $14.57 (settlement 5808)", isCompanyExpense: true },
  { doc: "5808", loadNumber: "13601", loadId: "8df416db-63b3-4497-bbd2-19f4cb355d72", date: "2026-09-16", amountCents: 4344, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99476767", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99476767 — 2026-09-16 — $43.44 (settlement 5808)", isCompanyExpense: true },
  { doc: "5808", loadNumber: "13601", loadId: "8df416db-63b3-4497-bbd2-19f4cb355d72", date: "2026-09-17", amountCents: 3426, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99119426", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99119426 — 2026-09-17 — $34.26 (settlement 5808)", isCompanyExpense: true },
  { doc: "5809", loadNumber: "13583", loadId: "ffb3bb73-b039-4e32-8ed7-ac43566ebb83", date: "2026-09-09", amountCents: 5111, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99149981", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99149981 — 2026-09-09 — $51.11 (settlement 5809)", isCompanyExpense: true },
  { doc: "5809", loadNumber: "13598", loadId: "c5da7a39-280d-4a36-88aa-77f978f9e191", date: "2026-09-12", amountCents: 3730, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99162813", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99162813 — 2026-09-12 — $37.30 (settlement 5809)", isCompanyExpense: true },
  { doc: "5809", loadNumber: "13598", loadId: "c5da7a39-280d-4a36-88aa-77f978f9e191", date: "2026-09-14", amountCents: 2033, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99596564", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99596564 — 2026-09-14 — $20.33 (settlement 5809)", isCompanyExpense: true },
  { doc: "5809", loadNumber: "13598", loadId: "c5da7a39-280d-4a36-88aa-77f978f9e191", date: "2026-09-15", amountCents: 2037, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99476002", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99476002 — 2026-09-15 — $20.37 (settlement 5809)", isCompanyExpense: true },
  { doc: "5809", loadNumber: "13598", loadId: "c5da7a39-280d-4a36-88aa-77f978f9e191", date: "2026-09-12", amountCents: 22500, vendorId: "d136dd16-77bb-4f31-b959-d9d854e3da3e", description: "Warehouse-Lumper Fee Expense", invoice: "171940", memo: "Warehouse-Lumper Fee Expense — PRIME INT — inv 171940 — 2026-09-12 — $225.00 (settlement 5809)", isCompanyExpense: true },
  { doc: "5809", loadNumber: "13606", loadId: "6f76f0eb-e674-455c-95e3-c483ff9cf487", date: "2026-09-17", amountCents: 3690, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99882087", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99882087 — 2026-09-17 — $36.90 (settlement 5809)", isCompanyExpense: true },
  { doc: "5810", loadNumber: "13590", loadId: "2bb2d1aa-612f-4fc3-8671-ee7ba90e036b", date: "2026-09-11", amountCents: 1473, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99997570", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99997570 — 2026-09-11 — $14.73 (settlement 5810)", isCompanyExpense: true },
  { doc: "5810", loadNumber: "13590", loadId: "2bb2d1aa-612f-4fc3-8671-ee7ba90e036b", date: "2026-09-11", amountCents: 1525, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Scale Expense:OTR-Scale Expense", invoice: "1932609", memo: "Scale Expense:OTR-Scale Expense — LOVES — inv 1932609 — 2026-09-11 — $15.25 (settlement 5810)", isCompanyExpense: true },
  { doc: "5810", loadNumber: "13590", loadId: "2bb2d1aa-612f-4fc3-8671-ee7ba90e036b", date: "2026-09-12", amountCents: 2283, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99542864", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99542864 — 2026-09-12 — $22.83 (settlement 5810)", isCompanyExpense: true },
  { doc: "5810", loadNumber: "13590", loadId: "2bb2d1aa-612f-4fc3-8671-ee7ba90e036b", date: "2026-09-13", amountCents: 4001, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99508633", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99508633 — 2026-09-13 — $40.01 (settlement 5810)", isCompanyExpense: true },
  { doc: "5810", loadNumber: "13590", loadId: "2bb2d1aa-612f-4fc3-8671-ee7ba90e036b", date: "2026-09-13", amountCents: 5500, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99508632", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99508632 — 2026-09-13 — $55.00 (settlement 5810)", isCompanyExpense: true },
  { doc: "5810", loadNumber: "13599", loadId: "e80e9d9e-ea84-4188-8e0b-bd770572ec93", date: "2026-09-15", amountCents: 1525, vendorId: "54027dca-0d76-4a62-aba8-eb8245fce534", description: "Scale Expense:OTR-Scale Expense", invoice: "5041918", memo: "Scale Expense:OTR-Scale Expense — FLYING — inv 5041918 — 2026-09-15 — $15.25 (settlement 5810)", isCompanyExpense: true },
  { doc: "5810", loadNumber: "13599", loadId: "e80e9d9e-ea84-4188-8e0b-bd770572ec93", date: "2026-09-15", amountCents: 525, vendorId: "54027dca-0d76-4a62-aba8-eb8245fce534", description: "Scale Expense:OTR-Scale Expense", invoice: "2072298", memo: "Scale Expense:OTR-Scale Expense — FLYING — inv 2072298 — 2026-09-15 — $5.25 (settlement 5810)", isCompanyExpense: true },
  { doc: "5810", loadNumber: "13599", loadId: "e80e9d9e-ea84-4188-8e0b-bd770572ec93", date: "2026-09-16", amountCents: 5502, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99476764", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99476764 — 2026-09-16 — $55.02 (settlement 5810)", isCompanyExpense: true },
  { doc: "5810", loadNumber: "13599", loadId: "e80e9d9e-ea84-4188-8e0b-bd770572ec93", date: "2026-09-16", amountCents: 9554, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-Reefer Diesel", invoice: "99476768", memo: "Fuel-Reefer Diesel — LOVES — inv 99476768 — 2026-09-16 — $95.54 (settlement 5810)", isCompanyExpense: true },
  { doc: "5810", loadNumber: "13599", loadId: "e80e9d9e-ea84-4188-8e0b-bd770572ec93", date: "2026-09-17", amountCents: 4273, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99807944", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99807944 — 2026-09-17 — $42.73 (settlement 5810)", isCompanyExpense: true },
  { doc: "5811", loadNumber: "13596", loadId: "deff9a3d-b8e1-4e43-aced-ff9bb7979841", date: "2026-09-13", amountCents: 8175, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99543793", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99543793 — 2026-09-13 — $81.75 (settlement 5811)", isCompanyExpense: true },
  { doc: "5811", loadNumber: "13596", loadId: "deff9a3d-b8e1-4e43-aced-ff9bb7979841", date: "2026-09-14", amountCents: 3924, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99475290", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99475290 — 2026-09-14 — $39.24 (settlement 5811)", isCompanyExpense: true },
  { doc: "5811", loadNumber: "13603", loadId: "4a066861-e929-44d7-bf9e-1f16c62f1671", date: "2026-09-17", amountCents: 4898, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99477095", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99477095 — 2026-09-17 — $48.98 (settlement 5811)", isCompanyExpense: true },
  { doc: "5811", loadNumber: "13603", loadId: "4a066861-e929-44d7-bf9e-1f16c62f1671", date: "2026-09-18", amountCents: 2319, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99157841", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99157841 — 2026-09-18 — $23.19 (settlement 5811)", isCompanyExpense: true },
  { doc: "5811", loadNumber: "13603", loadId: "4a066861-e929-44d7-bf9e-1f16c62f1671", date: "2026-09-19", amountCents: 2251, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99549122", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99549122 — 2026-09-19 — $22.51 (settlement 5811)", isCompanyExpense: true },
  { doc: "5812", loadNumber: "13588", loadId: "0a20a60d-c652-433b-9cfd-4d4e017c05cc", date: "2026-09-08", amountCents: 5521, vendorId: "aece329d-ef9d-4622-8281-1f1051ce8bf4", description: "TRACTOR-Washout Expense", invoice: "01043900", memo: "TRACTOR-Washout Expense — FUEL AMERICA — inv 01043900 — 2026-09-08 — $55.21 (settlement 5812)", isCompanyExpense: true },
  { doc: "5812", loadNumber: "13588", loadId: "0a20a60d-c652-433b-9cfd-4d4e017c05cc", date: "2026-09-09", amountCents: 5051, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99149999", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99149999 — 2026-09-09 — $50.51 (settlement 5812)", isCompanyExpense: true },
  { doc: "5812", loadNumber: "13600", loadId: "e4782161-7fc7-48a2-a164-96b6f30812c2", date: "2026-09-11", amountCents: 4953, vendorId: "62dd25a7-460e-4fd0-b4f7-d80ec59fd8a7", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99368358", memo: "Fuel-DEF-Diesel Exhaust Fluid — PILOT — inv 99368358 — 2026-09-11 — $49.53 (settlement 5812)", isCompanyExpense: true },
  { doc: "5812", loadNumber: "13600", loadId: "e4782161-7fc7-48a2-a164-96b6f30812c2", date: "2026-09-15", amountCents: 4268, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: null, memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv no-invoice — 2026-09-15 — $42.68 (settlement 5812)", isCompanyExpense: true },
  { doc: "5812", loadNumber: "13600", loadId: "e4782161-7fc7-48a2-a164-96b6f30812c2", date: "2026-09-16", amountCents: 1569, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99471198", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99471198 — 2026-09-16 — $15.69 (settlement 5812)", isCompanyExpense: true },
  { doc: "5813", loadNumber: "13602", loadId: "4cf0ffd3-f032-46ee-a62c-2202c34ea1ce", date: "2026-09-15", amountCents: 3418, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "2893712", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 2893712 — 2026-09-15 — $34.18 (settlement 5813)", isCompanyExpense: true },
  { doc: "5813", loadNumber: "13602", loadId: "4cf0ffd3-f032-46ee-a62c-2202c34ea1ce", date: "2026-09-16", amountCents: 1982, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "2373575", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 2373575 — 2026-09-16 — $19.82 (settlement 5813)", isCompanyExpense: true },
  { doc: "5813", loadNumber: "13602", loadId: "4cf0ffd3-f032-46ee-a62c-2202c34ea1ce", date: "2026-09-17", amountCents: 1946, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "1499386", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 1499386 — 2026-09-17 — $19.46 (settlement 5813)", isCompanyExpense: true },
  { doc: "5813", loadNumber: "13607", loadId: "65b7edb1-fe70-4e9d-9451-969c2770e9bc", date: "2026-09-18", amountCents: 2509, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "3557619", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 3557619 — 2026-09-18 — $25.09 (settlement 5813)", isCompanyExpense: true },
  { doc: "5813", loadNumber: "13607", loadId: "65b7edb1-fe70-4e9d-9451-969c2770e9bc", date: "2026-09-19", amountCents: 2194, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "2313445", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 2313445 — 2026-09-19 — $21.94 (settlement 5813)", isCompanyExpense: true },
  { doc: "5813", loadNumber: "13607", loadId: "65b7edb1-fe70-4e9d-9451-969c2770e9bc", date: "2026-09-20", amountCents: 1948, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "1047573", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 1047573 — 2026-09-20 — $19.48 (settlement 5813)", isCompanyExpense: true },
  { doc: "5814", loadNumber: "13604", loadId: "9ecc3121-8056-4e99-b35e-2e27a66d37c3", date: "2026-09-15", amountCents: 4590, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99416535", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99416535 — 2026-09-15 — $45.90 (settlement 5814)", isCompanyExpense: true },
  { doc: "5814", loadNumber: "13604", loadId: "9ecc3121-8056-4e99-b35e-2e27a66d37c3", date: "2026-09-17", amountCents: 4375, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99477699", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99477699 — 2026-09-17 — $43.75 (settlement 5814)", isCompanyExpense: true },
  { doc: "5814", loadNumber: "13608", loadId: "0e35b122-d643-411c-bac0-50f78690e507", date: "2026-09-19", amountCents: 3797, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99479001", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99479001 — 2026-09-19 — $37.97 (settlement 5814)", isCompanyExpense: true },
  { doc: "5814", loadNumber: "13608", loadId: "0e35b122-d643-411c-bac0-50f78690e507", date: "2026-09-21", amountCents: 3458, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99549704", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99549704 — 2026-09-21 — $34.58 (settlement 5814)", isCompanyExpense: true },
  { doc: "5815", loadNumber: "13605", loadId: "454bb0c5-5ec8-45b0-ab33-806fa3197d2e", date: "2026-09-15", amountCents: 3649, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99546338", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99546338 — 2026-09-15 — $36.49 (settlement 5815)", isCompanyExpense: true },
  { doc: "5815", loadNumber: "13605", loadId: "454bb0c5-5ec8-45b0-ab33-806fa3197d2e", date: "2026-09-16", amountCents: 1961, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99155958", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99155958 — 2026-09-16 — $19.61 (settlement 5815)", isCompanyExpense: true },
  { doc: "5815", loadNumber: "13611", loadId: "613657e2-7190-44a1-b773-83506ba37648", date: "2026-09-18", amountCents: 26910, vendorId: "3fa85ebf-b457-417a-8950-807f590e5125", description: "Warehouse-Lumper Fee Expense", invoice: null, memo: "Warehouse-Lumper Fee Expense — Smithfield Foods Inc — inv no-invoice — 2026-09-18 — $269.10 (settlement 5815)", isCompanyExpense: true },
  { doc: "5815", loadNumber: "13611", loadId: "613657e2-7190-44a1-b773-83506ba37648", date: "2026-09-19", amountCents: 3574, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99531370", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99531370 — 2026-09-19 — $35.74 (settlement 5815)", isCompanyExpense: true },
  { doc: "5815", loadNumber: "13611", loadId: "613657e2-7190-44a1-b773-83506ba37648", date: "2026-09-20", amountCents: 2115, vendorId: "5a529e97-5af6-4874-89c0-f300715101f2", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99159061", memo: "Fuel-DEF-Diesel Exhaust Fluid — LOVES — inv 99159061 — 2026-09-20 — $21.15 (settlement 5815)", isCompanyExpense: true },
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
    "x-test-auth": Buffer.from(JSON.stringify({ id: OWNER_USER_ID, role: "Owner", email: "tioperfumes07@gmail.com" }), "utf8").toString("base64url"),
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
