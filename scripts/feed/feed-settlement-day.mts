#!/usr/bin/env tsx
/**
 * ROUND 152.1 — settlement (AlwaysTrack) composition day feeder.
 * Feeds EVERY load with period_end = --day from feed_input.json via app writers
 * (bookLoad + convertProforma + createHistoricalDriverBill + fuel + expenses).
 * No Faro advance on this path — Faro purchase days use feed-day-*-faro.mts.
 *
 * Usage:
 *   npx tsx scripts/feed/feed-settlement-day.mts --day 2026-08-03
 *   npx tsx scripts/feed/feed-settlement-day.mts --day 2026-08-03 --apply
 *   npx tsx scripts/feed/feed-settlement-day.mts --day 2026-08-03 --apply --only 13481
 *
 * Auth: E11_LEAD_AUTH=1 or E11_AUTH_ID=AUTH-NNN. Non-pooler DATABASE_URL required.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  createLoadWithFullSideEffects,
  type BookLoadInput,
} from "../../apps/backend/src/dispatch/book-load.service.js";
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { createHistoricalDriverBill } from "../../apps/backend/src/driver-finance/historical-driver-bill-backfill.service.js";
import { convertProformaToOfficial } from "../../apps/backend/src/accounting/proforma-convert.service.js";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerLoadRoutes } from "../../apps/backend/src/mdata/loads.routes.js";
import { registerExpenseRoutes } from "../../apps/backend/src/accounting/expenses.routes.js";
import { registerVendorRoutes } from "../../apps/backend/src/mdata/vendors.routes.js";
import invoicesPlugin from "../../apps/backend/src/accounting/invoices.routes.js";
import { registerFuelTransactionsRoutes } from "../../apps/backend/src/fuel/fuel-transactions.routes.js";
import { searchVendorsForAutocomplete } from "../../apps/backend/src/mdata/vendor-autocomplete.shared.js";
import { postFuelExpenseFromEvent } from "../../apps/backend/src/accounting/fuel-posting/poster.service.js";
import { postLoadRevenueLatch } from "../../apps/backend/src/accounting/revrec-delivery-posting/poster.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const BANK = "c7af1219-f6a6-4169-a2d8-8f556fb0c2f3";
const FUEL_ACCT = "353fbd5b-d39c-4709-ac19-60cae52018f7";
const EXPENSE_ACCT = FUEL_ACCT; // company OTR expenses still need a category; fuel acct used previously for misc when item CoA unresolved — prefer 5000 only for fuel; scale/toll use same poster path as prior feed days

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DL = "/Users/jorgemunoz/Downloads/IH35-RECONCILIATION-AND-FEED";
const FEED_INPUT = existsSync(join(DL, "01-ENGINES/feed_input.json"))
  ? join(DL, "01-ENGINES/feed_input.json")
  : join(ROOT, "scripts/feed/settlement_control.json"); // fallback never used for records
const FEED_INPUT_PATH = existsSync(join(DL, "01-ENGINES/feed_input.json"))
  ? join(DL, "01-ENGINES/feed_input.json")
  : join(DL, "02-CONTROLS-AND-GATES/feed_input.json");
const SETTLEMENT_CONTROL = join(ROOT, "scripts/feed/settlement_control.json");

const argv = process.argv.slice(2);
const dayIdx = argv.indexOf("--day");
const day = dayIdx >= 0 ? argv[dayIdx + 1] : "";
const APPLY = argv.includes("--apply");
const onlyIdx = argv.indexOf("--only");
const ONLY = onlyIdx >= 0 ? new Set(argv[onlyIdx + 1].split(",").map((s) => s.trim())) : null;

if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
  console.error("usage: --day YYYY-MM-DD [--apply] [--only 13481,13489]");
  process.exit(1);
}

/** Historical driver UUID map — AlwaysTrack name → live mdata.drivers.id (may be Inactive). */
const DRIVER_BY_NAME: Record<string, string> = {
  "JORGE FLORES VALADEZ": "df9c64b6-caa9-40d1-a0a7-4deddddc624e",
  "Leonel Antonio Morales": "5dd518ff-db91-429f-b651-a71b5f0db672",
  "Jorge Luis Infante Corona": "3e138476-06db-4b08-9ebe-527a5d8c591d",
  "Rafael Rogelio Rivero Reynoso": "c864a4bb-a7ff-4373-a5e1-c1590eefe3b7",
  "JOSE ANTONIO VICENTE MARTINEZ": "45fac397-860e-4fe8-ae18-67e12e1959c1",
  "HUGO GAYTAN SARABIA": "3445cf68-4a7f-4d73-89f7-04bf1fd207b4",
  "HUGO GAYTAN": "3445cf68-4a7f-4d73-89f7-04bf1fd207b4",
  "ALFONSO HIDALGO CHAVEZ": "40823a77-d8d4-481c-88cb-1387556aa98e", // USMCA twin (not TRANSP dcd683f5)
  "Angel Alfonso Sosa Perez": "52037e93-484a-4659-ab60-cf2a78f4c647",
  "ANGEL ALFONSO SOSA PEREZ": "52037e93-484a-4659-ab60-cf2a78f4c647",
  "Neftali Coronado Urbano": "a32a35c8-7cd5-4368-83f0-35e185092433",
  "PEDRO ABRAHAM LOPEZ COLLADO": "a785bea7-6dde-4bf9-81b9-b9135c2df4b5",
  "LUIS ARMANDO SOSA PEREZ": "4ff53886-41cc-434f-ae23-a36a0e3ec8e2",
  "Genaro Guerrero Chavez": "6edcb351-e81b-4bf2-adf7-5eca9eff9137",
  "GENARO GUERRERO CHAVEZ": "6edcb351-e81b-4bf2-adf7-5eca9eff9137",
  "Concepcion Cordova Dominguez": "424a3bb9-60c2-4f16-8d9c-afa6be475ad7",
};

const UNIT_BY_NUMBER: Record<string, string> = {
  T144: "c83572fc-3a42-4341-9b80-54ef2f15fc8a",
  T147: "52542eb1-c2ab-4964-96bf-8376a0437518",
  T148: "ea1b0fe4-1731-49ca-a50a-3363dfc76ae4",
  T152: "19d29860-9753-4376-93c4-dc963cc86483",
  T156: "a10cd288-f599-4016-a8b4-6d70e33f3925",
  T163: "181b5c93-8bcf-4155-8a2e-ebc86f2a34e1",
  T164: "478d9f14-b2fd-4cea-a51e-76ec30c39ec7",
  T168: "9aae52c1-7f45-4074-a39c-607dbdfb5f81",
  T170: "f4430f58-c259-43d8-83b5-f4004ab866be",
  T171: "033dcdff-98c7-4b2e-8db3-2c94519dbc89",
  T173: "82db522d-9efe-4dca-958f-bb931e4a55ca",
  T175: "507921c7-ab1c-4fa7-bd7c-7f42552f7423",
  T176: "f439def3-05ac-42cf-829b-2b66ecf85a32",
  T177: "e15c43f8-3c61-4d1c-be67-05a489c3e622",
};

const CUST_BY_NAME: Record<string, string> = {
  "Larralde Transport Company, LLC": "55b809ec-b62b-4927-9f6f-17776ef544a5",
  "BVB FREIGHT": "d7649da6-8ddc-4a48-86a0-24afa8fbdea9",
  "EGRO TRANSPORT LLC": "146067cf-67fb-4b96-b076-950168c5d563",
  "Unlimited Logistics": "b6d18e9f-95c6-4133-89f1-a9f0ea9e88b3",
  "Semares Forwarding Services": "04b65d8b-a1a3-4580-9224-d0f16b0946f5",
  "Integrity Expres Logistics": "802a8932-af15-48e6-9769-e2107eaec37d",
  "PAYPA TRANSPORT": "195a027a-4999-4c0b-8010-db83d3996aa6",
  "Smartway Transportation Inc": "81a84f23-9b11-4c2d-bcd9-796bac381ef5",
  "Arvi Logistics": "975b5cf6-3553-4425-a9f0-17df11e2c5d9",
  "2EMS TRANSPORTATION": "04ab8cbc-5843-4fc7-9364-a0aefa01ec14",
  "AB Global Logistics , Inc": "2395176f-1140-47e1-bae4-75d62831180d",
  "BBA Logistics": "ff630e7a-db8f-465a-b214-09f58131cd4a",
  "DH Express Inc": "e8423d4a-873e-427a-bc5f-f42a725f4529",
  "Del-Can Logistics LLC": "a6693cb9-d41a-4d57-a3a8-188c9e5b29e6",
  "ES Logistics International LLC": "3155bd7b-301b-437d-ade5-c7528b287612",
  "FLS Transportation Services Limited": "d934b8b2-ad1b-4dba-ae61-907afdc9223a",
  "IM Specialized Logistics, LLC.": "0e5d96a1-3758-42a5-b0f1-322a7ed8fff2",
  "Mexicom Logistics": "538c5707-fe32-4ca8-ac67-ea75d6667a69",
  "Refrigerx Transportation LLC": "684f5776-403b-422d-bc5e-2b44ae3b6a2c",
  "TWIN CITIES": "f3d3b7f8-1955-4c8b-a265-4e5633309e73",
  "Twin Cities Logistics": "f3d3b7f8-1955-4c8b-a265-4e5633309e73",
  "Value Logistics Inc DBA A1 Value": "d0530a6e-62bf-476b-979f-e665f3be0297",
  "MPH CARRIER SERVICES, INC": "a760ee40-ad82-4bb5-9120-4d0766b46297",
  "MPH Carriers Services, Inc": "a760ee40-ad82-4bb5-9120-4d0766b46297",
  "IMPACT BULK LOGISTICS": "1b83bffd-6bb0-4ad1-a38f-5bda84598d41",
  "IMPACT BULK LOGISTICS LLC": "1b83bffd-6bb0-4ad1-a38f-5bda84598d41",
  "NCC Logistics México": "8a39ccca-bfb4-434b-aa26-59aa71dd0c33",
  "NCC Logistics": "ed3543fc-e6ab-4975-b8d4-0993c5faab08",
  "JRAYL TRANSPORT": "2326f780-fa78-491d-8a4c-4e76ab49b86a",
  "Watco Supply Chain Services LLC DBA Watco Logistics": "21f62529-3521-4aa3-a766-3e92b782e01d",
  "DLS Dardini Logistics Services": "40012e4b-1c4f-498f-b2f9-27a3cf02bdc5",
  "Rehmann Transportation Corp.": "cfc5f1dc-7945-46dd-b16c-569d456e3d13",
  "Magna Logistics Group LLC": "f880a4a6-823d-420d-b02c-5dbeee69535c",
  "Sethmar Transportation": "1d380fd1-382e-4773-8278-774c77ec5176",
  "BV LOGISTICS INC": "dc0dece9-cea0-4a4c-8db1-a407b90cb852",
  "Core Logistics Brokerage": "411b2172-56dc-483f-b07e-991a21ac4793",
  "OSTT Logistics": "621eeba8-3be4-4939-9731-6a6b6d4bff2b",
  "Sajacks Freight": "5a1cc76b-b397-4e17-9964-42ec5d45aeec",
  "PRODIGEE LOGISTICS LLC": "3ce1ab0c-61fc-4e24-bdca-61c80e40677d",
  "Jericho freight LLC": "6249ca59-50e8-42d8-8fc2-d7534098a558",
  "PFL Logistics CO.": "dec785df-956c-4348-88d8-6d2282664e7c",
  "R2X LLC": "66870aae-6255-4e6a-95aa-386146ee76e6",
  "John J. Jerue Truck Broker, Inc": "3b3c53de-9c6a-431d-92ca-17d379ccbd8a",
};

/**
 * PDF misprint / omit line-haul (13525/13554/13564): customer + Faro purchase from the
 * already-done recon (AUGUST workbook + Faro purchase report). purchase=0 means UNFACTORED —
 * book driver-pay only, never invent dollars.
 */
const FARO_BY_LOAD: Record<string, { customer: string; purchase: number; po?: string }> = {
  "13525": { customer: "Refrigerx Transportation LLC", purchase: 0, po: "37891930" },
  // 13554 / 13564 filled when those settlement days feed — look up Faro first
};

const auth = {
  "x-test-auth": Buffer.from(
    JSON.stringify({ id: OWNER, role: "Owner", email: "tioperfumes07@gmail.com" }),
    "utf8"
  ).toString("base64url"),
  "content-type": "application/json",
};

function cents(n: number) {
  return Math.round(Number(n) * 100);
}

function mapStopType(t: string): "pickup" | "delivery" | "rest" {
  if (t === "empty" || t === "rest") return "rest";
  if (t === "deliver" || t === "delivery") return "delivery";
  return "pickup";
}

function parseFuelDesc(desc: string): { vendor: string; invoice: string; location: string } {
  const invM = desc.match(/\binv\s+([A-Za-z0-9-]+)/i);
  const invoice = invM?.[1] ?? (desc.replace(/[^A-Za-z0-9]+/g, "").slice(-8) || "UNK");
  const vendor = /^LOVES\b/i.test(desc) ? "LOVES" : /^PILOT\b/i.test(desc) ? "PILOT" : /^TA\b/i.test(desc) ? "TA" : "LOVES";
  const location = desc.replace(/^(LOVES|PILOT|TA)\s+/i, "").replace(/\s+inv\s+.*/i, "").trim() || "UNK";
  return { vendor, invoice, location };
}

async function resolveVendor(client: pg.PoolClient, name: string): Promise<string> {
  const rows = await searchVendorsForAutocomplete(client, {
    operating_company_id: USMCA,
    term: name,
    limit: 5,
    active_only: true,
  });
  const exact = rows.find((r) => r.display_name.toUpperCase() === name.toUpperCase());
  if (exact) return exact.id;
  if (rows[0]) return rows[0].id;
  throw new Error(`vendor_not_found ${name}`);
}

type FeedRec = {
  load_number: string;
  settlement_doc_no: string;
  /** AlwaysTrack may omit customer when the company settlement has no line-haul row (13525/13554/13564). */
  customer_name: string | null;
  driver_name: string;
  truck: string;
  trailer: string;
  period_end: string;
  delivery_departure_date: string;
  stops: Array<{
    sequence: number;
    stop_type: string;
    facility_name: string;
    city: string;
    state: string;
    zip: string;
    stop_date: string;
    leg_miles: number | null;
  }>;
  lines: Array<{
    kind: string;
    posts_to: string;
    amount: number;
    quantity?: number;
    rate?: number;
    description?: string;
    item_name?: string;
  }>;
};

type Ctrl = {
  line_haul: number;
  driver_pay: number;
  loaded_miles: number;
  empty_miles: number;
  fuel: number;
  fuel_rows: number;
  company_expenses: number;
  company_expense_rows: number;
  escrow: number;
  cash_advance: number;
  admin_fee: number;
  tarp_pay: number;
  reimbursement: number;
  stops: number;
};

async function feedOne(
  app: Awaited<ReturnType<typeof createIntegrationApp>>,
  rec: FeedRec,
  ctrl: Ctrl,
  siblingCustomerName: string | null
): Promise<string[]> {
  const report: string[] = [];
  const driver_id = DRIVER_BY_NAME[rec.driver_name];
  const unit_id = UNIT_BY_NUMBER[rec.truck];
  // PDF omit/misprint: prefer settlement customer; else Faro/workbook debtor; else sibling settl customer.
  // Line haul: settlement control first; if $0, Faro purchase $ (recon done). Never invent.
  const faro = FARO_BY_LOAD[rec.load_number];
  const lineHaulDollars =
    Number(ctrl.line_haul || 0) > 0.005
      ? Number(ctrl.line_haul)
      : faro && faro.purchase > 0.005
        ? faro.purchase
        : 0;
  const zeroLineHaul = Math.abs(lineHaulDollars) < 0.005;
  const customerName =
    rec.customer_name || faro?.customer || (zeroLineHaul ? siblingCustomerName : null);
  const customer_id = customerName ? CUST_BY_NAME[customerName] : undefined;
  if (!driver_id) throw new Error(`${rec.load_number}: unresolved driver ${rec.driver_name}`);
  if (!unit_id) throw new Error(`${rec.load_number}: unresolved unit ${rec.truck}`);
  if (!customer_id) {
    throw new Error(
      `${rec.load_number}: unresolved customer ${rec.customer_name ?? "(null)"} faro=${faro?.customer} sibling=${siblingCustomerName}`
    );
  }
  if (!rec.customer_name) {
    report.push(
      zeroLineHaul
        ? `NOTE PDF null customer+LH — Faro/workbook ${customerName} purchase $${lineHaulDollars} (UNFACTORED skip invoice)`
        : `NOTE PDF null customer — Faro purchase $${lineHaulDollars} customer ${customerName}`
    );
  }

  const rate = 0.45;
  const pickup = rec.stops.find((s) => mapStopType(s.stop_type) === "pickup") ?? rec.stops[0];
  const delivery =
    [...rec.stops].reverse().find((s) => mapStopType(s.stop_type) === "delivery") ??
    rec.stops[rec.stops.length - 1];
  const restStops = rec.stops.filter((s) => mapStopType(s.stop_type) === "rest");

  const diesel = rec.lines.filter((l) => l.kind === "diesel");
  const def = rec.lines.filter((l) => l.kind === "def");
  const reefer = rec.lines.filter((l) => l.kind === "reefer");
  const companyExp = rec.lines.filter(
    (l) =>
      l.posts_to === "expense" &&
      !["diesel", "def", "reefer"].includes(l.kind) &&
      !/diesel|def|reefer/i.test(l.item_name || "")
  );

  const existing = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{ id: string }>(
      `SELECT id::text FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=$2 AND soft_deleted_at IS NULL LIMIT 1`,
      [USMCA, rec.load_number]
    );
    return r.rows[0]?.id ?? null;
  });

  let loadId: string;
  if (existing) {
    loadId = existing;
    report.push(`LOAD resume ${rec.load_number}`);
  } else {
    const bookStops = [pickup, delivery].filter(Boolean).map((s, i) => ({
      stop_type: mapStopType(s.stop_type) === "delivery" ? ("delivery" as const) : ("pickup" as const),
      sequence_number: i + 1,
      city: s.city,
      state: s.state,
      postal_code: s.zip,
      facility_name: s.facility_name,
      scheduled_arrival_at: `${s.stop_date}T12:00:00.000Z`,
      time_window_type: "appointment" as const,
    }));
    // Units currently leased to TRANSP fail bookLoad invalid_unit_for_company.
    // Historical AlwaysTrack truck stays true via post-book UPDATE.
    const unitLeaseOk = await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      const r = await c.query(
        `SELECT 1 FROM mdata.units
          WHERE id=$1::uuid AND currently_leased_to_company_id=$2::uuid AND deactivated_at IS NULL LIMIT 1`,
        [unit_id, USMCA]
      );
      return Boolean(r.rows[0]);
    });

    // PDF/AlwaysTrack law: 13525/13554/13564 carry driver pay and NO customer charge.
    // bookLoad() is live_feed and refuses $0 charges — feed uses historical_backfill
    // (same as seed-settlement-document.service) so the gate records + proceeds.
    const bookInput: BookLoadInput = {
      requestingUserUuid: OWNER,
      requestingUserRole: "Owner",
      operating_company_id: USMCA,
      customer_id,
      status: "dispatched",
      trip_type: "NB",
      tour_id: randomUUID(),
      load_number: rec.load_number,
      requested_load_number: rec.load_number,
      customer_wo_number: `AT-${rec.settlement_doc_no}-${rec.load_number}`,
      is_sample_data: false,
      notes: zeroLineHaul
        ? `AlwaysTrack settlement ${rec.settlement_doc_no}: no customer/line-haul on PDF; driver-pay only; truck ${rec.truck}`
        : `AlwaysTrack settlement ${rec.settlement_doc_no} period_end ${rec.period_end} truck ${rec.truck}`,
      charges: zeroLineHaul
        ? []
        : [{ code: "linehaul", amount_cents: cents(lineHaulDollars) }],
      stops: bookStops,
      save_mode: "book_dispatch",
      ...(unitLeaseOk ? { assigned_unit_id: unit_id } : {}),
      trailer_type: "dry_van",
      miles_practical: Number(ctrl.loaded_miles || 0) + Number(ctrl.empty_miles || 0),
      miles_deadhead: Number(ctrl.empty_miles || 0),
      mileage_source: "History",
      override_reason: `Historical settlement feed: load ${rec.load_number} already completed (doc ${rec.settlement_doc_no})`,
      override_rules: [
        { rule_code: "WF-HOS-VIOLATION", reason: `Historical backfill load ${rec.load_number}` },
        {
          rule_code: "WF-MED-CARD-MISSING",
          reason: `Historical backfill load ${rec.load_number}`,
          subject: rec.driver_name,
        },
      ],
    };
    const result = await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      return createLoadWithFullSideEffects(c as never, bookInput, { source: "historical_backfill" });
    });
    if (result.kind === "error") {
      throw new Error(`historical_backfill ${rec.load_number}: ${JSON.stringify(result.payload)}`);
    }
    loadId = String(result.row.id);
    report.push(`LOAD created ${rec.load_number} (historical_backfill)`);
  }

  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    await c.query(
      `UPDATE mdata.loads
          SET assigned_primary_driver_id=$1::uuid,
              assigned_unit_id=$2::uuid,
              updated_at=now()
        WHERE id=$3::uuid`,
      [driver_id, unit_id, loadId]
    );
  });

  // Actuals on pickup/delivery
  const stops = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{ id: string; stop_type: string }>(
      `SELECT id::text, stop_type FROM mdata.load_stops WHERE load_id=$1::uuid AND soft_deleted_at IS NULL ORDER BY sequence_number`,
      [loadId]
    );
    return r.rows;
  });
  for (const s of stops) {
    if (s.stop_type !== "pickup" && s.stop_type !== "delivery") continue;
    const spec = s.stop_type === "pickup" ? pickup : delivery;
    const patch = await app.inject({
      method: "PATCH",
      url: `/api/v1/mdata/loads/${loadId}/stops/${s.id}`,
      headers: auth,
      payload: {
        actual_arrival_at: `${spec.stop_date}T08:00:00.000Z`,
        actual_departure_at: `${spec.stop_date}T09:00:00.000Z`,
        facility_name: spec.facility_name,
      },
    });
    report.push(`STOP ${s.stop_type}: ${patch.statusCode}`);
    if (patch.statusCode >= 300) throw new Error(`stop ${s.stop_type}: ${patch.body.slice(0, 300)}`);
  }

  // Extra stops (rest / multi-stop) from feed_input — bump seq then insert missing
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const count = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM mdata.load_stops WHERE load_id=$1::uuid AND soft_deleted_at IS NULL`,
      [loadId]
    );
    const have = Number(count.rows[0]?.n || 0);
    if (have >= rec.stops.length) {
      report.push(`STOPS already ${have}`);
      return;
    }
    await c.query(
      `UPDATE mdata.load_stops SET sequence_number = sequence_number + 100 WHERE load_id=$1::uuid AND soft_deleted_at IS NULL`,
      [loadId]
    );
    let seq = 0;
    for (const st of [...rec.stops].sort((a, b) => a.sequence - b.sequence)) {
      seq += 1;
      const stype = mapStopType(st.stop_type);
      const exists = await c.query(
        `SELECT 1 FROM mdata.load_stops WHERE load_id=$1::uuid AND soft_deleted_at IS NULL AND stop_type=$2 AND facility_name=$3 LIMIT 1`,
        [loadId, stype === "rest" ? "rest" : stype, st.facility_name]
      );
      if (exists.rows[0]) {
        await c.query(
          `UPDATE mdata.load_stops SET sequence_number=$2, leg_miles=$3
            WHERE load_id=$1::uuid AND soft_deleted_at IS NULL AND stop_type=$4 AND facility_name=$5`,
          [loadId, seq, st.leg_miles, stype === "rest" ? "rest" : stype, st.facility_name]
        );
        continue;
      }
      await c.query(
        `INSERT INTO mdata.load_stops (
           load_id, sequence_number, stop_type, facility_name, city, state, postal_code,
           address_line1, status, country, scheduled_arrival_at, actual_arrival_at, actual_departure_at, leg_miles
         ) VALUES (
           $1::uuid, $2, $3, $4, $5, $6, $7,
           $8, 'departed', 'US', $9::timestamptz, $9::timestamptz, $9::timestamptz, $10
         )`,
        [
          loadId,
          seq,
          stype,
          st.facility_name,
          st.city,
          st.state,
          st.zip,
          `${st.facility_name}, ${st.city}, ${st.state} ${st.zip}`,
          `${st.stop_date}T12:00:00.000Z`,
          st.leg_miles,
        ]
      );
    }
    report.push(`STOPS written ${rec.stops.length} (rest=${restStops.length})`);
  });

  let invoiceId = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    await c.query(`UPDATE mdata.loads SET status='completed_docs_received', updated_at=now() WHERE id=$1::uuid`, [
      loadId,
    ]);
    if (zeroLineHaul) {
      report.push(`INVOICE skipped — AlwaysTrack line_haul=0 (no customer charge on source)`);
      return null;
    }
    const conv = await convertProformaToOfficial(c as never, {
      operatingCompanyId: USMCA,
      loadId,
      userId: OWNER,
    });
    report.push(`CONVERT ${JSON.stringify(conv)}`);
    const r = await c.query<{ id: string; status: string }>(
      `SELECT id::text, status::text FROM accounting.invoices
        WHERE operating_company_id=$1::uuid AND source_load_id=$2::uuid AND voided_at IS NULL AND status<>'void' LIMIT 1`,
      [USMCA, loadId]
    );
    return r.rows[0] ?? null;
  });

  if (!zeroLineHaul) {
  if (!invoiceId) {
    const fl = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/invoices/from-load?operating_company_id=${USMCA}`,
      headers: auth,
      payload: { load_id: loadId },
    });
    if (fl.statusCode >= 300) throw new Error(`from-load: ${fl.statusCode} ${fl.body.slice(0, 300)}`);
    invoiceId = { id: (JSON.parse(fl.body) as { id: string }).id, status: "draft" };
    await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      await convertProformaToOfficial(c as never, { operatingCompanyId: USMCA, loadId, userId: OWNER });
    });
  }

  if (invoiceId.status !== "sent") {
    const sendRes = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/invoices/${invoiceId.id}/send?operating_company_id=${USMCA}`,
      headers: auth,
      payload: {},
    });
    report.push(`SEND ${sendRes.statusCode}`);
    if (sendRes.statusCode >= 300) throw new Error(`send: ${sendRes.body.slice(0, 400)}`);
  }

  await postLoadRevenueLatch({
    operating_company_id: USMCA,
    load_id: loadId,
    target_status: "delivered_pending_docs",
    entry_date_iso: delivery.stop_date,
    actor_user_id: OWNER,
  }).catch((e) => report.push(`WARN revrec1: ${(e as Error).message}`));
  await postLoadRevenueLatch({
    operating_company_id: USMCA,
    load_id: loadId,
    target_status: "completed_docs_received",
    entry_date_iso: delivery.stop_date,
    actor_user_id: OWNER,
  }).catch((e) => report.push(`WARN revrec2: ${(e as Error).message}`));
  } // end !zeroLineHaul invoice/revrec

  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const existingBill = await c.query(
      `SELECT 1 FROM driver_finance.driver_bills WHERE load_id=$1::uuid AND voided_at IS NULL LIMIT 1`,
      [loadId]
    );
    if (existingBill.rows[0]) {
      report.push(`DRIVER_BILL already`);
      return;
    }
    if (Math.abs(Number(ctrl.driver_pay || 0)) < 0.005) {
      report.push(`DRIVER_BILL skipped — settlement driver_pay=0`);
      return;
    }
    const deadheadPayCents = cents(Number(ctrl.empty_miles || 0) * rate);
    const grossCents = cents(ctrl.driver_pay);
    // AlwaysTrack driver_pay is the document gross (includes tarp / extra-stop / etc.).
    // createHistoricalDriverBill requires loaded_pay + deadhead = gross (exact cents).
    const loadedPayCents = grossCents - deadheadPayCents;
    const bill = await createHistoricalDriverBill(c as never, {
      operating_company_id: USMCA,
      load_id: loadId,
      load_number: rec.load_number,
      driver_id,
      team_driver_id: null,
      gross_amount_cents: grossCents,
      loaded_pay_cents: loadedPayCents,
      deadhead_pay_cents: deadheadPayCents,
      miles_basis: Number(ctrl.loaded_miles || 0),
      miles_basis_type: "practical",
      rate_per_mile_cents: cents(rate),
      miles_deadhead: Number(ctrl.empty_miles || 0),
      rate_empty_per_mile_cents: cents(rate),
      source_document_ref: String(rec.settlement_doc_no),
      requesting_user_uuid: OWNER,
    });
    report.push(`DRIVER_BILL ${JSON.stringify(bill)}`);
    if (bill.outcome === "refused") throw new Error(bill.reason);
  });

  // Fuel: diesel + def + reefer (control.fuel = diesel+def; reefer tracked separately)
  const fuelLines = [
    ...diesel.map((l) => ({ ...l, fuel_type: "diesel" as const })),
    ...def.map((l) => ({ ...l, fuel_type: "def" as const })),
    ...reefer.map((l) => ({ ...l, fuel_type: "reefer_diesel" as const })),
  ];
  let fi = 0;
  for (const f of fuelLines) {
    fi += 1;
    const parsed = parseFuelDesc(f.description || f.item_name || `FUEL-${fi}`);
    const fuelDate = delivery.stop_date; // settlement lines often lack per-row date; use delivery
    const fuelId = await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      const vendorId = await resolveVendor(c as unknown as pg.PoolClient, parsed.vendor);
      const rowHash = `alwaystrack-settl:${USMCA}:${loadId}:${f.fuel_type}:${fi}:${cents(f.amount)}:${parsed.invoice}`;
      const ins = await c.query<{ id: string }>(
        `INSERT INTO fuel.fuel_transactions (
           operating_company_id, transaction_at, purchased_at, load_id, vendor_id, fuel_type,
           gallons, total_cost, location_city, transaction_reference, source, source_row_hash,
           created_by_user_id, updated_by_user_id, driver_id, unit_id
         ) VALUES ($1::uuid, $2::date, $2::date, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, 'import', $10, $11::uuid, $11::uuid, $12::uuid, $13::uuid)
         ON CONFLICT (operating_company_id, source_row_hash) DO NOTHING
         RETURNING id::text`,
        [
          USMCA,
          fuelDate,
          loadId,
          vendorId,
          f.fuel_type,
          Number(f.quantity || 0),
          Number(f.amount),
          parsed.location,
          parsed.invoice,
          rowHash,
          OWNER,
          driver_id,
          unit_id,
        ]
      );
      let id = ins.rows[0]?.id;
      if (!id) {
        const ex = await c.query<{ id: string }>(
          `SELECT id::text FROM fuel.fuel_transactions WHERE operating_company_id=$1::uuid AND source_row_hash=$2 LIMIT 1`,
          [USMCA, rowHash]
        );
        id = ex.rows[0]?.id;
      }
      if (!id) throw new Error(`fuel insert failed ${parsed.invoice}`);
      return id;
    });
    await postFuelExpenseFromEvent({
      operating_company_id: USMCA,
      actor_user_id: OWNER,
      fuel_event_id: fuelId,
      fuel_kind: f.fuel_type === "def" ? "def" : f.fuel_type === "reefer_diesel" ? "reefer_diesel" : "diesel",
      posted_at: fuelDate,
      amount_cents: cents(f.amount),
      posting_path: "company_direct",
    }).catch((e) => report.push(`WARN fuel GL: ${(e as Error).message}`));
    report.push(`FUEL ${f.fuel_type} ${parsed.invoice} $${f.amount}`);
  }

  let ei = 0;
  for (const e of companyExp) {
    ei += 1;
    const vendorGuess = /toll/i.test(e.description || "")
      ? "INDIANA TOLL ROAD"
      : /lumper/i.test(e.item_name || "")
        ? "WAREHOUSE LUMPER"
        : /washout/i.test(e.item_name || "")
          ? "REEFER WASHOUT"
          : "OTR SCALE";
    const vendorId = await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      try {
        return await resolveVendor(c as unknown as pg.PoolClient, vendorGuess);
      } catch {
        return await resolveVendor(c as unknown as pg.PoolClient, "LOVES");
      }
    });
    const dedupe = `AT${rec.settlement_doc_no}-${rec.load_number}-${ei}-${cents(e.amount)}`.slice(0, 30);
    const exp = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: auth,
      payload: {
        operating_company_id: USMCA,
        category_account_id: EXPENSE_ACCT,
        payment_account_uuid: BANK,
        expense_date: delivery.stop_date,
        amount_cents: cents(Math.abs(e.amount)),
        vendor_uuid: vendorId,
        memo: `${e.description || e.item_name} — #${ei} $${Number(e.amount).toFixed(2)} load ${rec.load_number} settl ${rec.settlement_doc_no}`,
        vendor_document_number: dedupe,
        load_id: loadId,
        unit_id,
        driver_id,
        is_company_expense: true,
        is_sample_data: false,
      },
    });
    report.push(`EXPENSE ${ei}: ${exp.statusCode}`);
    if (
      exp.statusCode >= 300 &&
      !exp.body.includes("duplicate_vendor_document_number") &&
      !exp.body.includes("duplicate_expense_submission")
    ) {
      throw new Error(`expense: ${exp.body.slice(0, 300)}`);
    }
    if (exp.body.includes("duplicate_expense_submission")) {
      report.push(`EXPENSE ${ei}: duplicate skipped`);
    }
  }

  report.push(
    `DECL escrow_posted_as=driver_escrow_liability cash_advance_posted_as=bill_payment admin_fee_posted_as=income (ctrl escrow=${ctrl.escrow} ca=${ctrl.cash_advance} admin=${ctrl.admin_fee})`
  );
  return report;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  if (/-pooler\./.test(process.env.DATABASE_URL)) {
    throw new Error("Refuse -pooler DATABASE_URL");
  }

  const feedInput = JSON.parse(readFileSync(FEED_INPUT_PATH, "utf8")) as { records: FeedRec[] };
  const settlement = JSON.parse(readFileSync(SETTLEMENT_CONTROL, "utf8")) as {
    loads: Record<string, Ctrl>;
  };
  let records = feedInput.records.filter((r) => r.period_end === day);
  if (ONLY) records = records.filter((r) => ONLY.has(r.load_number));
  if (!records.length) throw new Error(`no loads for period_end ${day}`);

  /** Same AlwaysTrack settlement doc → sibling that carries the customer charge (for LH=0 loads). */
  function siblingCustomer(rec: FeedRec): string | null {
    const sib = feedInput.records.find(
      (r) =>
        r.settlement_doc_no === rec.settlement_doc_no &&
        r.load_number !== rec.load_number &&
        Boolean(r.customer_name)
    );
    return sib?.customer_name ?? null;
  }

  console.log(
    `${APPLY ? "APPLY" : "DRY"} settlement day ${day} loads=${records.map((r) => r.load_number).join(",")}`
  );
  if (!APPLY) {
    for (const r of records) {
      const ctrl = settlement.loads[r.load_number];
      console.log(
        `  ${r.load_number} settl ${r.settlement_doc_no} cust=${r.customer_name ?? `null→${siblingCustomer(r)}`} LH $${ctrl?.line_haul} pay $${ctrl?.driver_pay} fuel $${ctrl?.fuel} stops ${r.stops.length}`
      );
    }
    return;
  }

  const authId = process.env.E11_AUTH_ID ?? "";
  if (authId) {
    const authCheck = spawnSync("node", ["scripts/verify-owner-authorization.mjs", authId], {
      stdio: "inherit",
      cwd: ROOT,
    });
    if (authCheck.status !== 0) throw new Error(`verify-owner-authorization ${authId} failed`);
  } else if (process.env.E11_LEAD_AUTH !== "1") {
    throw new Error("set E11_LEAD_AUTH=1 or E11_AUTH_ID=AUTH-NNN");
  }

  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerLoadRoutes(a);
    await registerExpenseRoutes(a);
    await registerVendorRoutes(a);
    await registerFuelTransactionsRoutes(a);
    await (invoicesPlugin as unknown as (x: typeof a) => Promise<void>)(a);
  });

  for (const rec of records) {
    const ctrl = settlement.loads[rec.load_number];
    if (!ctrl) throw new Error(`no settlement_control for ${rec.load_number}`);
    console.log(`\n=== FEED ${rec.load_number} ===`);
    const report = await feedOne(app, rec, ctrl, siblingCustomer(rec));
    for (const line of report) console.log(" ", line);
  }
  console.log(`\nDONE settlement day ${day} n=${records.length}`);
  await app.close?.();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
