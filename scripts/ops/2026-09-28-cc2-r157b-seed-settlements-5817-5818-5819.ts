#!/usr/bin/env tsx
/**
 * scripts/ops/2026-09-28-cc2-r157b-seed-settlements-5817-5818-5819.ts — ROUND 155.13/157-B item 2.
 *
 * Seeds real driver settlements 5817, 5818, 5819 through the Settlement Creator engine
 * (previewSettlementCreator / postSettlementCreatorInClientTx — existing engines only, no new GL
 * math), replacing the empty pre-settlement shells P-0001 (Genaro Guerrero Chavez → 5817),
 * P-0004 (Ruben Pedro Perez Garcia → 5818), P-0002 (Neftali Coronado Urbano → 5819) via the
 * engine's own sanctioned Edit-override path (settlement_no = the existing P-series id,
 * edit_void_repost = true — voids the empty shell, creates a new row with the SAME display_id).
 *
 * Source of truth: feed-input/settlement-truth-from-pdfs.json (signed AlwaysTrack PDF transcript),
 * keys "5817"/"5818"/"5819", cross-checked against the actual signed PDFs in ~/Downloads and
 * against 09-25-26-DRIVER CARRIER EXPENSES.xlsx for 5818's one gap (see below). Every dollar
 * amount below traces to one of those three sources — nothing is invented or plugged.
 *
 * 5818 correction (the feed's own JSON omits a category the signed PDF has): the PDF has FOUR
 * line categories (Salary, Additional Pay, Reimbursed Expenses, Deductions), not three — the JSON
 * schema has no reimbursements array. $1,040.18 salary + $50.00 additional pay (Layover-Estancia,
 * load 13609) + $15.25 reimbursement (LOVES/TPE Scale Expense, load 13609) - $90.00 deductions =
 * $1,015.43, penny-exact to the signed PDF's TOTAL DUE. 5817 and 5819's PDFs were independently
 * re-read and confirmed to match their feed entries exactly (no missing category).
 *
 * R-186.1 (5819 only): the display_id "5819" already exists as a cancelled/voided fake from the
 * retired allocator (id c50e6c82-efff-4432-a1f5-b1e7edc42dd0) — LEFT ALONE, never touched, never
 * reused. The real settlement posts under P-0002's own display_id; source_document_ref is set to
 * "5819" afterward via the one sanctioned setter (setSettlementSourceDocumentRef).
 *
 * `is_sample_data` is never set true — this is real USMCA money.
 *
 * Usage:
 *   DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cc2-r157b-seed-settlements-5817-5818-5819.ts --dry-run
 *   OWNER_AUTH_ID=AUTH-095 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cc2-r157b-seed-settlements-5817-5818-5819.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  previewSettlementCreator,
  postSettlementCreatorInClientTx,
} from "../../apps/backend/src/driver-finance/settlement-creator.service.js";
import { setSettlementSourceDocumentRef } from "../../apps/backend/src/driver-finance/settlement-source-document-ref.service.js";
import type { SettlementCreatorDraft, SettlementCreatorLoadBlock } from "../../apps/backend/src/driver-finance/settlement-creator.types.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const AUTH_ID = "AUTH-095";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // identity.users tioperfumes07@gmail.com, role Owner

type FeedLoad = {
  truck?: string;
  trailer?: string;
  loaded_miles?: number;
  loaded_rate?: number;
  loaded_amount?: number;
  empty_miles?: number;
  empty_rate?: number;
  empty_amount?: number;
  stops: Array<{ type: string; date: string }>;
};
type FeedDeduction = { load: string; date: string; desc: string; amount: number };
type FeedAdditionalPay = { load: string; desc: string; amount: number };
type FeedSettlement = {
  settlement: string;
  loads: Record<string, FeedLoad>;
  additional_pay: FeedAdditionalPay[];
  deductions: FeedDeduction[];
  period_start: string;
  period_end: string;
  driver_name: string;
  total_due: number;
};

function loadFeed(): Record<string, FeedSettlement> {
  const p = path.join(ROOT, "feed-input/settlement-truth-from-pdfs.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function centsOf(dollars: number): number {
  return Math.round(dollars * 100);
}

function deliveryDateOf(loads: Record<string, FeedLoad>, loadNumber: string): string | null {
  const stops = loads[loadNumber]?.stops ?? [];
  const deliver = stops.find((s) => s.type === "Deliver");
  return deliver?.date ?? null;
}

const TARGETS: Array<{
  key: "5817" | "5818" | "5819";
  presettlementId: string;
  driverId: string;
  driverLabel: string;
  targetTotalDueCents: number;
  extraAdditionalPay?: Array<{ load_number: string; description: string; amount_cents: number }>;
  extraReimbursements?: Array<{ load_number: string; description: string; amount_cents: number }>;
  setSourceDocumentRefAfterPost?: string;
}> = [
  {
    key: "5817",
    presettlementId: "P-0001",
    driverId: "6edcb351-e81b-4bf2-adf7-5eca9eff9137", // Genaro Guerrero Chavez
    driverLabel: "Genaro Guerrero Chavez",
    targetTotalDueCents: centsOf(1617.66),
  },
  {
    key: "5818",
    presettlementId: "P-0004",
    driverId: "1ec7654c-1ae9-4f3d-9af6-af9fd4b6bcc9", // Ruben Pedro Perez Garcia
    driverLabel: "Ruben Pedro Perez Garcia",
    targetTotalDueCents: centsOf(1015.43),
    extraAdditionalPay: [
      {
        load_number: "13609",
        description: "Driver Pay-Layover-Estancia 21y22 DE SEPTIEMBRE",
        amount_cents: centsOf(50.0),
      },
    ],
    extraReimbursements: [
      {
        load_number: "13609",
        description: "Driver Reimbursement-TPE-Scale Expense (LOVES, inv 1142716)",
        amount_cents: centsOf(15.25),
      },
    ],
  },
  {
    key: "5819",
    presettlementId: "P-0002",
    driverId: "a32a35c8-7cd5-4368-83f0-35e185092433", // Neftali Coronado Urbano
    driverLabel: "Neftali Coronado Urbano",
    targetTotalDueCents: centsOf(1955.75),
    setSourceDocumentRefAfterPost: "5819",
  },
];

function buildDraft(feed: Record<string, FeedSettlement>, t: (typeof TARGETS)[number]): SettlementCreatorDraft {
  const s = feed[t.key];
  if (!s) throw new Error(`feed missing settlement ${t.key}`);

  const loads: SettlementCreatorLoadBlock[] = Object.entries(s.loads).map(([loadNumber, l]) => ({
    load_number: loadNumber,
    loaded_miles: l.loaded_miles ?? null,
    line_haul_rate_cents: l.loaded_rate != null ? Math.round(l.loaded_rate * 100) : null,
    line_haul_amount_cents: null, // let the engine derive from loaded_miles * rate (keeps quantity/rate populated)
    empty_miles: l.empty_miles ?? null,
    empty_rate_cents: l.empty_rate != null ? Math.round(l.empty_rate * 100) : null,
    accessorials: [],
    factoring: "faro_usmca",
    delivery_date: deliveryDateOf(s.loads, loadNumber),
    not_yet_delivered: false,
  }));

  const escrow = s.deductions
    .filter((d) => /escrow/i.test(d.desc))
    .map((d) => ({ description: d.desc, amount_cents: centsOf(Math.abs(d.amount)), load_number: d.load }));

  const adminFeeItems = s.deductions.filter((d) => /admin\s*fee/i.test(d.desc));
  const adminFeeCents = adminFeeItems.reduce((sum, d) => sum + centsOf(Math.abs(d.amount)), 0);

  const genericDeductions = s.deductions
    .filter((d) => !/escrow/i.test(d.desc) && !/admin\s*fee/i.test(d.desc))
    .map((d) => ({ description: d.desc, amount_cents: centsOf(Math.abs(d.amount)), load_number: d.load }));

  const additionalPay = [
    ...s.additional_pay.map((p) => ({
      description: p.desc,
      amount_cents: centsOf(p.amount),
      load_number: p.load,
      pay_kind: "other" as const,
    })),
    ...(t.extraAdditionalPay ?? []).map((p) => ({
      description: p.description,
      amount_cents: p.amount_cents,
      load_number: p.load_number,
      pay_kind: "other" as const,
    })),
  ];

  const reimbursements = (t.extraReimbursements ?? []).map((r) => ({
    description: r.description,
    amount_cents: r.amount_cents,
    load_number: r.load_number,
  }));

  return {
    operating_company_id: USMCA,
    settlement_no: t.presettlementId,
    edit_void_repost: true,
    driver_id: t.driverId,
    period_start: s.period_start,
    period_end: s.period_end,
    loads,
    fuel_purchases: [],
    expenses: [],
    deductions: genericDeductions,
    reimbursements,
    additional_pay: additionalPay,
    escrow,
    advances: [],
    admin_fee_cents: adminFeeCents,
    pdf_driver_net_cents: t.targetTotalDueCents,
    pdf_company_expenses_cents: 0,
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && process.env.OWNER_AUTH_ID !== AUTH_ID) {
    console.error(
      `REFUSED: --apply requires OWNER_AUTH_ID=${AUTH_ID} and an OPEN ${AUTH_ID} entry in ` +
        `docs/bus/OWNER-AUTHORIZATIONS.md. Neither is present. Run --dry-run instead.`,
    );
    process.exit(1);
  }

  const feed = loadFeed();
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });

  for (const t of TARGETS) {
    const draft = buildDraft(feed, t);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
      await client.query(`SET LOCAL app.operating_company_id = '${USMCA}'`);

      const preview = await previewSettlementCreator(client as never, draft);
      console.log(`\n=== ${t.key} (${t.driverLabel}, shell ${t.presettlementId}) ===`);
      console.log(`  driver_net_cents:      ${preview.driver_net_cents}  (target ${t.targetTotalDueCents})`);
      console.log(`  driver_net_matches_pdf: ${preview.driver_net_matches_pdf}`);
      console.log(`  balanced:              ${preview.balanced} (debit ${preview.debit_total_cents} / credit ${preview.credit_total_cents})`);
      console.log(`  can_post:              ${preview.can_post}`);
      if (preview.blockers.length) console.log(`  blockers: ${preview.blockers.join(" | ")}`);

      if (!preview.can_post) {
        console.error(`  REFUSED: ${t.key} cannot post — see blockers above. Nothing applied for this settlement.`);
        await client.query("ROLLBACK");
        continue;
      }

      if (!apply) {
        console.log(`  DRY RUN — would post ${t.key} onto ${t.presettlementId} (void+repost).`);
        await client.query("ROLLBACK");
        continue;
      }

      const result = await postSettlementCreatorInClientTx(client as never, OWNER_USER_ID, draft);
      console.log(`  POSTED: settlement_id=${result.settlement_id} display_id=${result.display_id}`);

      if (t.setSourceDocumentRefAfterPost) {
        const updated = await setSettlementSourceDocumentRef(client as never, {
          operatingCompanyId: USMCA,
          settlementId: result.settlement_id,
          sourceDocumentRef: t.setSourceDocumentRefAfterPost,
          actorUserId: OWNER_USER_ID,
        });
        console.log(`  source_document_ref set: ${JSON.stringify(updated)}`);
      }

      await client.query("COMMIT");
      console.log(`  COMMITTED.`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`  ERROR on ${t.key}: ${err instanceof Error ? err.message : String(err)}`);
      if (apply) throw err;
    } finally {
      client.release();
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
