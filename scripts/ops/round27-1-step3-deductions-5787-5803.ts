#!/usr/bin/env tsx
// ROUND 27.1 STEP 3 — DEDUCTIONS, settlements 5787-5803 (18-settlement scope 5786-5803 minus 5786/5796,
// which carry zero deductions, and 5795/5800, already fixed by ROUND 26.3 STEP 4A / PR #22134).
//
// SOURCE OF TRUTH: ~/Downloads/IH35-MASTER-RECONCILIATION-2026-09-21.xlsx DEDUCTIONS sheet, reproduced by
// the fixed scripts/alwaystrack/parse_settlements.py (root-cause fixes: Reimbursed Expenses regex,
// Additional Pay parsing, trailing-numeric-tail anchoring, per-section tie assertions — see that file's
// docstring). Every one of the 39 lines below is independently re-derived from the signed settlement
// documents' own text, not copied from the xlsx blind.
//
// WHY THIS SCRIPT EXISTS, SAME REASONING AS ROUND-26.3-STEP-4A (scripts/ops/round26-3-step4a-fix-5795-5800.ts):
// every one of these 14 settlements is 'locked'. materializeSettlementLines() hard-refuses any
// settlement whose status !== 'open' (settlement-lines-materialize.service.ts, "Only an OPEN settlement
// can gain new lines"). This script reuses that same file's exported resolveDeductionPostingAccount()
// (the identical account-resolution branch materializeSettlementLines itself calls) with the
// settlement-status gate removed — the ONE thing this correction is authorized to cross — and writes the
// settlement_lines INSERT in the identical shape. Header math (deductions_total/net_pay) is written
// EXCLUSIVELY by the existing, already-shipped, status-agnostic recomputeSettlementHeader()
// (settlement-load-reassignment.service.ts) — the SAME function the sanctioned B5 load-reassignment
// primitive already calls against locked/closed settlements in production. NO raw UPDATE against
// driver_finance.driver_settlements at any point.
//
// LIVE DISCOVERY (not assumed, queried): every one of these 39 lines ALREADY EXISTS as a
// driver_finance.driver_settlement_deductions row, status='pending', from an earlier historical-backfill
// pass — the SAME defect class ROUND-26.3-STEP-4A found and fixed for 5795/5800: most rows are
// mis-pointed at the WRONG settlement (a small set of catch-all "shell" settlement ids — 5775, 5782,
// 5784, 5785 among others — used as a dumping ground before the real per-document shells existed), even
// though the row's own `reason` text correctly names the RIGHT settlement/tour number. 3 kinds of item:
//   "already_applied" (repoint:false, already exists on this file as `reuse` with repoint:false) —
//     applied_to_settlement_id ALREADY equals the target settlement; only load_id backfill + materialize.
//   "repoint" (repoint:true) — applied_to_settlement_id points at a decoy shell; UPDATE it to the real
//     settlement (+ status='applied', + load_id), matching ROUND-26.3-STEP-4A's exact precedent.
//   "create" — no existing row of any kind (driver+amount+load all searched, live, before writing this
///    plan) — a genuinely new deduction, 8 of the 9 are the standard $25.00 escrow-for-claims line every
//     settlement carries, the 9th is 5801/13570's "Cash Advance-Efectivo" $200.00 (a real, separate
//     finding — NOT one of the two pre-2026-08-27 wire-transfer advances the ticket named; the ticket's
//     own two named exceptions, 5787's -151.99 and 5788's two lines, were ALL found as pre-existing rows
//     and are `reuse` items above, not `create`).
//
// NO REVERSES (owner law 2026-09-13). Nothing voided, nothing re-cut. Missing lines are ADDED; mis-pointed
// lines are REPOINTED to where their own text already says they belong.
//
// SAFETY: --execute requires ROUND271_ALLOW_HOST naming the exact host in DATABASE_URL, mirroring
// ROUND-26.3-STEP-4A's own double-confirmation gate. Default is DRY RUN (no writes). Each settlement is
// its own transaction — a MISMATCH after recompute aborts only that settlement, never the whole run.
//
// ACTUAL OUTCOME (read docs/bus/CORRECTION-REGISTER-ROUND-27.1-STEP3-DEDUCTIONS.md in full before
// re-running this): 10 of the 14 settlements below FAIL their own target check and roll back, because
// their deductions_total/net_pay were ALREADY CORRECT via the original historical-backfill import,
// independent of settlement_lines -- recomputeSettlementHeader() against them would have overwritten an
// already-correct header from an incomplete settlement_lines snapshot. The transaction-and-rollback
// design is what caught this; it is not a bug to "fix" by relaxing the target check. Only 5793/5797/
// 5799/5802 (single, non-colliding items) landed a real, harmless materialization. Do not re-run this
// script expecting the other 10 to land -- they are already correct and this script correctly refuses
// them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { resolveDeductionPostingAccount } from "../../apps/backend/src/driver-finance/settlement-lines-materialize.service.js";
import { SETTLEMENT_DEDUCTION_SOURCE_TABLE } from "../../apps/backend/src/driver-finance/deductions.service.js";
import { recomputeSettlementHeader } from "../../apps/backend/src/driver-finance/settlement-load-reassignment.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // tioperfumes07@gmail.com, role Owner
const REGISTER_PATH = path.join(ROOT, "docs/bus/CORRECTION-REGISTER-ROUND-27.1-STEP3-DEDUCTIONS.md");

type LoadRef = { number: string; id: string };
type ReuseItem = {
  kind: "reuse";
  deductionId: string;
  description: string;
  amountCents: number;
  deductionType: string;
  load: LoadRef;
  repoint: boolean; // true = applied_to_settlement_id must be corrected; false = already correct
};
type CreateItem = {
  kind: "create";
  description: string;
  amountCents: number;
  deductionType: string;
  load: LoadRef;
};
type Item = ReuseItem | CreateItem;

type SettlementPlan = {
  doc: string;
  settlementId: string;
  driverId: string;
  targetDeductionsTotal: number;
  targetNetPay: number;
  items: Item[];
};

const PLANS: SettlementPlan[] = [
  {
    doc: "5787",
    settlementId: "52c7977b-16af-418a-ae38-05b689e724c5",
    driverId: "40823a77-d8d4-481c-88cb-1387556aa98e",
    targetDeductionsTotal: 211.99,
    targetNetPay: 885.73,
    items: [
      { kind: "reuse", deductionId: "58454c44-66d2-429f-a11e-49b09c3a7bbc", description: "Driver-Escrow For Claims - Driver-Escrow For Claims", amountCents: 2500, deductionType: "escrow_contribution", load: { number: "13549", id: "084f46c8-4acd-43e2-b80c-d3c4124d90c2" }, repoint: true },
      { kind: "reuse", deductionId: "c26f3489-2e66-41e9-bf49-918d01a891f6", description: "CASH ADVANCE WIRE TRANSFER - CASH ADVANCE WIRE TRANSFER", amountCents: 15199, deductionType: "advance", load: { number: "13549", id: "084f46c8-4acd-43e2-b80c-d3c4124d90c2" }, repoint: true },
      { kind: "reuse", deductionId: "bcd3f00c-1da6-4251-8977-09f49879a839", description: "Driver-Escrow For Claims - Driver-Escrow For Claims", amountCents: 2500, deductionType: "escrow_contribution", load: { number: "13555", id: "c7fa57b9-19d6-4c73-8fdd-143b0ad134a4" }, repoint: true },
      { kind: "reuse", deductionId: "db33da09-87ba-4601-b4ed-e6912cdcccf9", description: "Admin fee - GAS", amountCents: 1000, deductionType: "other", load: { number: "13555", id: "c7fa57b9-19d6-4c73-8fdd-143b0ad134a4" }, repoint: false },
    ],
  },
  {
    doc: "5788",
    settlementId: "9007277f-3168-440d-a981-4b8b415413c8",
    driverId: "fba21d80-628b-4228-ae54-336f9cbb73b6",
    targetDeductionsTotal: 451.99,
    targetNetPay: 1273.90,
    items: [
      { kind: "reuse", deductionId: "7a5e88ec-9a1c-4254-9b4c-5206b6a48352", description: "Driver-Escrow For Claims - Driver-Escrow For Claims", amountCents: 2500, deductionType: "escrow_contribution", load: { number: "13539", id: "b7a92e7f-93a5-41f8-88ad-f5536eaf9023" }, repoint: true },
      { kind: "reuse", deductionId: "d3ce9841-bbb8-425f-823f-6f198b136f74", description: "Driver-Escrow For Claims - Driver-Escrow For Claims", amountCents: 2500, deductionType: "escrow_contribution", load: { number: "13546", id: "0602ce28-6cbd-4732-bc70-399319b7e057" }, repoint: true },
      { kind: "reuse", deductionId: "42a654ea-2c6f-440a-8516-8a52bedeec2c", description: "Admin fee - PAGO DE TELEFONO PERSONAL", amountCents: 16500, deductionType: "other", load: { number: "13546", id: "0602ce28-6cbd-4732-bc70-399319b7e057" }, repoint: true },
      { kind: "reuse", deductionId: "8e6744f0-a81e-4f38-9eb9-877351951eb5", description: "CASH ADVANCE WIRE TRANSFER - CASH ADVANCE WIRE TRANSFER", amountCents: 20199, deductionType: "advance", load: { number: "13546", id: "0602ce28-6cbd-4732-bc70-399319b7e057" }, repoint: true },
      { kind: "reuse", deductionId: "41b06412-61b5-45a8-a334-0a3a3db139ac", description: "Driver-Escrow For Claims - Driver-Escrow For Claims", amountCents: 2500, deductionType: "escrow_contribution", load: { number: "13552", id: "fe6efd8c-979b-4fbd-86e1-e23f46091887" }, repoint: true },
      { kind: "reuse", deductionId: "6f93642d-9272-4730-870a-852a2c8d9277", description: "Admin fee - Gas", amountCents: 1000, deductionType: "other", load: { number: "13552", id: "fe6efd8c-979b-4fbd-86e1-e23f46091887" }, repoint: true },
    ],
  },
  {
    doc: "5789",
    settlementId: "47111c9f-3c4c-4f16-814c-647c110b6734",
    driverId: "3e138476-06db-4b08-9ebe-527a5d8c591d",
    targetDeductionsTotal: 10.00,
    targetNetPay: 2015.85,
    items: [
      { kind: "reuse", deductionId: "18aeb1f5-a02d-4a0f-a2f6-ad12c94e3490", description: "Admin fee - Gas", amountCents: 1000, deductionType: "other", load: { number: "13557", id: "8ed22a9f-c23b-4b93-8c08-2e2e16674c8e" }, repoint: false },
    ],
  },
  {
    doc: "5790",
    settlementId: "e68626d4-5a41-40bc-90d3-2ae1a4c6456b",
    driverId: "5dd518ff-db91-429f-b651-a71b5f0db672",
    targetDeductionsTotal: 60.00,
    targetNetPay: 1452.75,
    items: [
      { kind: "create", description: "Driver-Escrow For Claims - Driver-Escrow For Claims", amountCents: 2500, deductionType: "escrow_contribution", load: { number: "13542", id: "e351668f-0e49-458f-b869-0efd9b55e1e1" } },
      { kind: "create", description: "Driver-Escrow For Claims - Driver-Escrow For Claims", amountCents: 2500, deductionType: "escrow_contribution", load: { number: "13554", id: "f71c62cb-8573-4452-9917-4e072de12439" } },
      { kind: "reuse", deductionId: "7413ddc0-cfa7-4885-8a29-bd1de3fe1d76", description: "Admin fee - GAS", amountCents: 1000, deductionType: "other", load: { number: "13554", id: "f71c62cb-8573-4452-9917-4e072de12439" }, repoint: false },
    ],
  },
  {
    doc: "5791",
    settlementId: "262255a1-4f2d-44cd-9922-c8bf96555426",
    driverId: "3445cf68-4a7f-4d73-89f7-04bf1fd207b4",
    targetDeductionsTotal: 60.00,
    targetNetPay: 1630.03,
    items: [
      { kind: "reuse", deductionId: "f053af71-af0a-41ee-8d39-a0ce83cfb7fa", description: "Driver-Escrow For Claims - Driver-Escrow For Claims", amountCents: 2500, deductionType: "escrow_contribution", load: { number: "13545", id: "aec16789-884b-47b4-aa50-5353c50b8af9" }, repoint: true },
      { kind: "reuse", deductionId: "6afd9ac0-a074-4073-bdc1-3983e70dad06", description: "Driver-Escrow For Claims - Driver-Escrow For Claims", amountCents: 2500, deductionType: "escrow_contribution", load: { number: "13560", id: "6f21d0e9-2f78-4189-80f0-ed62bc756027" }, repoint: true },
      { kind: "reuse", deductionId: "a640da88-5bef-45dd-aecb-6c53a6651134", description: "Admin fee - GAS", amountCents: 1000, deductionType: "other", load: { number: "13560", id: "6f21d0e9-2f78-4189-80f0-ed62bc756027" }, repoint: false },
    ],
  },
  {
    doc: "5792",
    settlementId: "b6df9d73-4b87-4590-8dfc-7311fe74b51e",
    driverId: "6edcb351-e81b-4bf2-adf7-5eca9eff9137",
    targetDeductionsTotal: 352.00,
    targetNetPay: 1386.05,
    items: [
      { kind: "reuse", deductionId: "06e0bbf7-b7c2-40c2-8b69-7cec95bff8fe", description: "Driver-Escrow For Claims - Driver-Escrow For Claims", amountCents: 2500, deductionType: "escrow_contribution", load: { number: "13547", id: "aa27f617-a251-4953-a251-c8bcb717241a" }, repoint: true },
      { kind: "reuse", deductionId: "b4279189-8799-4ebc-a15a-848c2997a4b0", description: "Driver-Escrow For Claims - Driver-Escrow For Claims", amountCents: 2500, deductionType: "escrow_contribution", load: { number: "13559", id: "cdfafd0c-307d-4d2a-b861-d27781e749ee" }, repoint: true },
      { kind: "reuse", deductionId: "545b381c-ef06-4831-969e-b600d3feb35a", description: "Driver-Escrow For Claims - Driver-Escrow For Claims", amountCents: 2500, deductionType: "escrow_contribution", load: { number: "13562", id: "d021d9a0-f36d-4d7b-87d2-cf6a57c2d00c" }, repoint: true },
      { kind: "reuse", deductionId: "720cfc84-f5a4-441b-8e8f-b6b46806016b", description: "Admin fee - GAS", amountCents: 1000, deductionType: "other", load: { number: "13562", id: "d021d9a0-f36d-4d7b-87d2-cf6a57c2d00c" }, repoint: true },
      { kind: "reuse", deductionId: "bd0c5516-7e26-407c-ae2e-1d19ce1b43a2", description: "Admin fee - VUELO", amountCents: 26700, deductionType: "other", load: { number: "13562", id: "d021d9a0-f36d-4d7b-87d2-cf6a57c2d00c" }, repoint: true },
    ],
  },
  {
    doc: "5793",
    settlementId: "4a2033d0-208d-4c5e-80bb-ae3de7daecf8",
    driverId: "a32a35c8-7cd5-4368-83f0-35e185092433",
    targetDeductionsTotal: 10.00,
    targetNetPay: 1568.91,
    items: [
      { kind: "reuse", deductionId: "23d4ec30-ba4a-40a7-a2cc-f321cb073333", description: "Admin fee - GAS", amountCents: 1000, deductionType: "other", load: { number: "13566", id: "dceaa511-d641-4a2e-a0e2-2ac8a264326d" }, repoint: false },
    ],
  },
  {
    doc: "5794",
    settlementId: "c594a5c6-21cb-4488-90bb-d8e4c8100811",
    driverId: "45fac397-860e-4fe8-ae18-67e12e1959c1",
    targetDeductionsTotal: 60.00,
    targetNetPay: 1330.60,
    items: [
      { kind: "reuse", deductionId: "9dbe9a9d-9deb-44f5-9133-e996c03bc5f4", description: "Driver-Escrow For Claims - Driver-Escrow For Claims", amountCents: 2500, deductionType: "escrow_contribution", load: { number: "13558", id: "ef05f3d0-6dae-4835-a263-37e7adcc231d" }, repoint: true },
      { kind: "reuse", deductionId: "597851f2-4531-48b5-a808-cfbedd49f56e", description: "Driver-Escrow For Claims - Driver-Escrow For Claims", amountCents: 2500, deductionType: "escrow_contribution", load: { number: "13568", id: "019dd038-b077-4722-a1ce-cbcc6498e9d7" }, repoint: true },
      { kind: "reuse", deductionId: "f2ba1c9b-e077-474f-982c-6193287ca84d", description: "Admin fee - GAS", amountCents: 1000, deductionType: "other", load: { number: "13568", id: "019dd038-b077-4722-a1ce-cbcc6498e9d7" }, repoint: false },
    ],
  },
  {
    doc: "5797",
    settlementId: "553170bd-aba3-48f8-b51f-9454859084d8",
    driverId: "93be328f-ba1b-4175-adaf-bb619c1c51f2",
    targetDeductionsTotal: 10.00,
    targetNetPay: 1544.48,
    items: [
      { kind: "reuse", deductionId: "442621d0-b083-4353-89fc-df24c6182501", description: "Admin fee - GAS", amountCents: 1000, deductionType: "other", load: { number: "13577", id: "2c2d0ad9-125a-4015-9fea-0a5b9dc96575" }, repoint: false },
    ],
  },
  {
    doc: "5798",
    settlementId: "4d37edff-6369-443b-b890-af0d3b97f8b2",
    driverId: "6edcb351-e81b-4bf2-adf7-5eca9eff9137",
    targetDeductionsTotal: 60.00,
    targetNetPay: 927.85,
    items: [
      { kind: "create", description: "Driver-Escrow For Claims - Driver-Escrow For Claims", amountCents: 2500, deductionType: "escrow_contribution", load: { number: "13572", id: "43809ccf-30c9-487b-bef8-28822ed83a77" } },
      { kind: "create", description: "Driver-Escrow For Claims - Driver-Escrow For Claims", amountCents: 2500, deductionType: "escrow_contribution", load: { number: "13575", id: "bf11cff0-121e-4558-8538-3aa50b65c733" } },
      { kind: "reuse", deductionId: "3f62e520-720e-458e-ad3c-ce865bbfa514", description: "Admin fee - GAS", amountCents: 1000, deductionType: "other", load: { number: "13575", id: "bf11cff0-121e-4558-8538-3aa50b65c733" }, repoint: false },
    ],
  },
  {
    doc: "5799",
    settlementId: "afe1e6c0-f368-4b7d-b408-e75bbfea250d",
    driverId: "3e138476-06db-4b08-9ebe-527a5d8c591d",
    targetDeductionsTotal: 10.00,
    targetNetPay: 2523.91,
    items: [
      { kind: "reuse", deductionId: "4f80ceae-3a6f-4935-b7c8-e3f86b00c4b3", description: "Admin fee - GAS", amountCents: 1000, deductionType: "other", load: { number: "13574", id: "ec9c2e04-ca3c-42fd-a93a-f433846b5a14" }, repoint: false },
    ],
  },
  {
    doc: "5801",
    settlementId: "c0fdcc2a-2abb-421c-bfd2-fcf5973b7a33",
    driverId: "61727a46-af2e-4d33-8236-e2d99b737708",
    targetDeductionsTotal: 260.00,
    targetNetPay: 1334.02,
    items: [
      { kind: "create", description: "Driver-Escrow For Claims - Driver-Escrow For Claims", amountCents: 2500, deductionType: "escrow_contribution", load: { number: "13570", id: "58d62a6c-46fd-4d56-ae0f-01320dbd667e" } },
      { kind: "create", description: "Cash Advance-Efectivo - Cash Advance-Efectivo", amountCents: 20000, deductionType: "advance", load: { number: "13570", id: "58d62a6c-46fd-4d56-ae0f-01320dbd667e" } },
      { kind: "create", description: "Driver-Escrow For Claims - Driver-Escrow For Claims", amountCents: 2500, deductionType: "escrow_contribution", load: { number: "13580", id: "902b2534-802b-4892-92b5-23e007a3cd19" } },
      { kind: "reuse", deductionId: "7b880224-2bcc-423e-8742-e0aa91af344d", description: "Admin fee - GAS", amountCents: 1000, deductionType: "other", load: { number: "13580", id: "902b2534-802b-4892-92b5-23e007a3cd19" }, repoint: false },
    ],
  },
  {
    doc: "5802",
    settlementId: "2e1dad71-afca-4590-bb39-3ace3f03a073",
    driverId: "a32a35c8-7cd5-4368-83f0-35e185092433",
    targetDeductionsTotal: 10.00,
    targetNetPay: 2104.84,
    items: [
      { kind: "reuse", deductionId: "c8d22444-ff44-4a9f-9e15-f7d90f2e7e16", description: "Admin fee - GAS", amountCents: 1000, deductionType: "other", load: { number: "13589", id: "3c5df9e4-be78-442d-b938-db31ed50bfe7" }, repoint: false },
    ],
  },
  {
    doc: "5803",
    settlementId: "3f67ff6b-0334-4234-b3b0-a09617c77b39",
    driverId: "5dd518ff-db91-429f-b651-a71b5f0db672",
    targetDeductionsTotal: 60.00,
    targetNetPay: 1624.05,
    items: [
      { kind: "create", description: "Driver-Escrow For Claims - Driver-Escrow For Claims", amountCents: 2500, deductionType: "escrow_contribution", load: { number: "13564", id: "f0d40e79-4f7a-4b64-947a-77677ef3e4fc" } },
      { kind: "create", description: "Driver-Escrow For Claims - Driver-Escrow For Claims", amountCents: 2500, deductionType: "escrow_contribution", load: { number: "13586", id: "a9038951-09ec-4f50-be1b-75e3a42ae51a" } },
      { kind: "reuse", deductionId: "4bce4a04-49af-46dd-83be-5f5257311d99", description: "Admin fee - GAS", amountCents: 1000, deductionType: "other", load: { number: "13586", id: "a9038951-09ec-4f50-be1b-75e3a42ae51a" }, repoint: false },
    ],
  },
];

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

async function processSettlement(client: DbClient, plan: SettlementPlan, execute: boolean) {
  const settlementRes = await client.query<{ status: string; source_document_ref: string; is_sample_data: boolean }>(
    `SELECT status::text, source_document_ref, is_sample_data FROM driver_finance.driver_settlements
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [plan.settlementId, USMCA_COMPANY_ID]
  );
  const s = settlementRes.rows[0];
  if (!s) throw new Error(`ABORT ${plan.doc}: settlement ${plan.settlementId} not found`);
  if (s.source_document_ref !== plan.doc) {
    throw new Error(`ABORT ${plan.doc}: source_document_ref mismatch (found '${s.source_document_ref}')`);
  }
  if (s.status !== "locked") {
    throw new Error(`ABORT ${plan.doc}: expected status='locked', found '${s.status}' -- re-check before proceeding`);
  }

  const lines: string[] = [`## ${plan.doc} (${plan.settlementId})`];

  for (const item of plan.items) {
    let deductionId: string;
    if (item.kind === "reuse") {
      const cur = await client.query<{ applied_to_settlement_id: string | null; status: string; voided_at: string | null; amount_cents: string }>(
        `SELECT applied_to_settlement_id::text, status, voided_at::text, amount_cents::text
           FROM driver_finance.driver_settlement_deductions
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [item.deductionId, USMCA_COMPANY_ID]
      );
      const row = cur.rows[0];
      if (!row) throw new Error(`ABORT ${plan.doc}: reuse deduction ${item.deductionId} not found`);
      if (row.voided_at) throw new Error(`ABORT ${plan.doc}: reuse deduction ${item.deductionId} is voided`);
      if (Number(row.amount_cents) !== item.amountCents) {
        throw new Error(`ABORT ${plan.doc}: reuse deduction ${item.deductionId} amount_cents=${row.amount_cents}, expected ${item.amountCents}`);
      }
      if (!item.repoint && row.applied_to_settlement_id !== plan.settlementId) {
        throw new Error(`ABORT ${plan.doc}: expected ${item.deductionId} already applied to ${plan.settlementId}, found ${row.applied_to_settlement_id ?? "NULL"} -- plan is stale, re-verify live`);
      }
      deductionId = item.deductionId;
      lines.push(
        `- ${item.repoint ? "REPOINT" : "REUSE (already applied)"} ${item.deductionId} "${item.description}" $${(item.amountCents / 100).toFixed(2)} -- was applied_to_settlement_id=${row.applied_to_settlement_id ?? "NULL"} status=${row.status} -> ${plan.settlementId}, status='applied', load_id=${item.load.number}`
      );
      if (execute) {
        await client.query(
          `UPDATE driver_finance.driver_settlement_deductions
              SET applied_to_settlement_id = $2::uuid, status = 'applied', remaining_balance_cents = 0,
                  load_id = COALESCE(load_id, $3::uuid), updated_at = now()
            WHERE id = $1::uuid AND operating_company_id = $4::uuid`,
          [deductionId, plan.settlementId, item.load.id, USMCA_COMPANY_ID]
        );
      }
    } else {
      lines.push(
        `- CREATE "${item.description}" $${(item.amountCents / 100).toFixed(2)} load ${item.load.number} deduction_type=${item.deductionType}`
      );
      if (execute) {
        const ins = await client.query<{ id: string }>(
          `
            INSERT INTO driver_finance.driver_settlement_deductions (
              operating_company_id, driver_id, deduction_type, amount_cents, reason,
              applied_to_settlement_id, created_by_user_id, load_id, status, remaining_balance_cents
            )
            VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7::uuid, $8::uuid, 'applied', 0)
            RETURNING id::text
          `,
          [USMCA_COMPANY_ID, plan.driverId, item.deductionType, item.amountCents, item.description, plan.settlementId, OWNER_ACTOR_USER_ID, item.load.id]
        );
        deductionId = ins.rows[0]!.id;
        lines[lines.length - 1] += ` -> ${deductionId}`;
      } else {
        deductionId = "(dry-run, not yet created)";
      }
    }

    if (execute) {
      // uq_settlement_lines_no_duplicate_lines is a REAL DB-level unique index on exactly
      // (settlement_id, line_type, description, amount) WHERE is_active -- it has NO load_id column.
      // Several of these settlements (5792, 5798, 5801, 5803...) carry the SAME description+amount
      // (e.g. two or three separate "$25.00 Driver-Escrow For Claims" lines, one per load) -- inserting
      // them with identical description text would collide on that real constraint (second/third line
      // silently short-circuited by this same dup-check, or a hard DB conflict without it). The load
      // number is appended to the settlement_lines description (display-only; the underlying
      // driver_finance.driver_settlement_deductions.reason keeps the original AlwaysTrack text
      // unchanged) so every line is genuinely distinct under the real index, never a guessed workaround.
      const lineDescription = `${item.description} (load ${item.load.number})`;
      // Idempotency keys on source_reference_id (the FK back to the driver_settlement_deductions row,
      // unique per logical item) rather than description text -- a description-format change between
      // runs must never cause a real logical item to be re-inserted as a duplicate.
      const dup = await client.query<{ id: string }>(
        `SELECT id::text FROM driver_finance.settlement_lines
          WHERE settlement_id = $1::uuid AND line_type = 'deduction' AND source_reference_id = $2::uuid AND is_active = true`,
        [plan.settlementId, deductionId]
      );
      if (dup.rows[0]) {
        lines.push(`  (settlement_lines row already exists: ${dup.rows[0].id} -- skipped, idempotent re-run)`);
        continue;
      }

      const { roleKey, postingAccountId, unresolvedReason } = await resolveDeductionPostingAccount(
        client as never,
        USMCA_COMPANY_ID,
        plan.driverId,
        item.deductionType
      );
      const approvalStatus = postingAccountId ? "approved" : "pending";

      const lineRes = await client.query<{ id: string }>(
        `
          INSERT INTO driver_finance.settlement_lines (
            settlement_id, line_type, description, amount, load_id, source_table, source_reference_id,
            posting_account_id, approval_status, is_sample_data
          )
          VALUES ($1::uuid, 'deduction', $2, $3::numeric, $4::uuid, $5, $6::uuid, $7::uuid, $8, $9)
          RETURNING id::text
        `,
        [
          plan.settlementId,
          lineDescription,
          (item.amountCents / 100).toFixed(2),
          item.load.id,
          SETTLEMENT_DEDUCTION_SOURCE_TABLE,
          deductionId,
          postingAccountId,
          approvalStatus,
          s.is_sample_data,
        ]
      );
      lines.push(
        `  settlement_lines ${lineRes.rows[0]!.id} role=${roleKey} posting_account_id=${postingAccountId ?? "NULL"} approval_status=${approvalStatus}${unresolvedReason ? ` (${unresolvedReason})` : ""}`
      );
    }
  }

  if (execute) {
    const before = await client.query<{ deductions_total: string; net_pay: string }>(
      `SELECT deductions_total::text, net_pay::text FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
      [plan.settlementId]
    );
    const { method } = await recomputeSettlementHeader(client as never, plan.settlementId, USMCA_COMPANY_ID);
    const after = await client.query<{ deductions_total: string; net_pay: string; gross_pay: string }>(
      `SELECT deductions_total::text, net_pay::text, gross_pay::text FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
      [plan.settlementId]
    );
    const a = after.rows[0]!;
    lines.push(
      `- recomputeSettlementHeader method=${method}: deductions_total ${before.rows[0]!.deductions_total} -> ${a.deductions_total}, net_pay ${before.rows[0]!.net_pay} -> ${a.net_pay} (gross_pay ${a.gross_pay})`
    );
    const dedOk = Number(a.deductions_total).toFixed(2) === plan.targetDeductionsTotal.toFixed(2);
    const netOk = Number(a.net_pay).toFixed(2) === plan.targetNetPay.toFixed(2);
    lines.push(`- TARGET deductions_total=${plan.targetDeductionsTotal.toFixed(2)} net_pay=${plan.targetNetPay.toFixed(2)} -- ${dedOk && netOk ? "MATCH" : "MISMATCH"}`);
    if (!dedOk || !netOk) throw new Error(`ABORT ${plan.doc}: recomputed header did not land on target -- got deductions_total=${a.deductions_total} net_pay=${a.net_pay} gross_pay=${a.gross_pay}, wanted deductions_total=${plan.targetDeductionsTotal.toFixed(2)} net_pay=${plan.targetNetPay.toFixed(2)}\n${lines.join("\n")}`);
  }

  return lines;
}

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (executeFlag && !process.env.ROUND271_ALLOW_HOST) {
    throw new Error("ABORT: --execute requires ROUND271_ALLOW_HOST to name the exact host in DATABASE_URL.");
  }
  if (executeFlag && !url.includes(process.env.ROUND271_ALLOW_HOST!)) {
    throw new Error("ABORT: DATABASE_URL does not match ROUND271_ALLOW_HOST -- refusing to execute.");
  }

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  const allLines: string[] = [
    `# ROUND 27.1 STEP 3 -- DEDUCTIONS correction register (settlements 5787-5803)`,
    ``,
    `Source: ~/Downloads/IH35-MASTER-RECONCILIATION-2026-09-21.xlsx DEDUCTIONS sheet, reproduced by the`,
    `fixed scripts/alwaystrack/parse_settlements.py. 14 settlements, 39 deduction lines: 29 already existed`,
    `as pending driver_settlement_deductions rows (12 already correctly applied, 17 mis-pointed at a decoy`,
    `shell settlement and repointed), 9 genuinely created new (8 standard $25 escrow lines + 5801/13570's`,
    `$200 Cash Advance-Efectivo). 5786/5796 carry zero deductions; 5795/5800 already fixed by ROUND 26.3`,
    `STEP 4A (PR #22134). Run by CC-3 (Claude), ${new Date().toISOString()}.`,
    `Actor user id (owner): ${OWNER_ACTOR_USER_ID}. Mode: ${executeFlag ? "EXECUTE" : "DRY RUN"}.`,
    ``,
  ];

  let failures = 0;
  try {
    for (const plan of PLANS) {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      try {
        const lines = await processSettlement(client, plan, executeFlag);
        if (executeFlag) {
          await client.query("COMMIT");
        } else {
          await client.query("ROLLBACK");
        }
        allLines.push(...lines, "");
        console.log(lines.join("\n"));
      } catch (err) {
        await client.query("ROLLBACK");
        failures++;
        const msg = err instanceof Error ? err.message : String(err);
        allLines.push(`## ${plan.doc} -- FAILED: ${msg}`, "");
        console.error(`FAILED ${plan.doc}: ${msg}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  if (executeFlag) {
    fs.writeFileSync(REGISTER_PATH, allLines.join("\n") + "\n", "utf8");
    console.log(`\nCorrection register written: ${REGISTER_PATH}`);
  } else {
    console.log("\nDRY RUN ONLY -- pass --execute with ROUND271_ALLOW_HOST set to actually run. No writes made.");
  }
  if (failures > 0) {
    console.error(`\n${failures} settlement(s) FAILED -- see above. Not all 14 settlements landed.`);
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
