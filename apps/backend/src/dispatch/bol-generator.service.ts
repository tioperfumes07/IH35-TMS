import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Handlebars from "handlebars";
import puppeteer from "puppeteer";
import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { deleteObjectBytes, putObjectBytes, isR2Configured } from "../storage/r2-client.js";

export type BolStopRow = {
  stopType: string;
  sequence: number;
  locationName: string;
  address: string;
  cityState: string;
  scheduledWindow: string;
};

export type BolTemplatePayload = {
  loadNumber: string;
  generatedAt: string;
  templateVersion: string;
  carrierName: string;
  carrierAddress: string;
  customerName: string;
  customerAddress: string;
  commodity: string;
  weight: string;
  pieces: string;
  referenceNumber: string;
  driverName: string;
  unitDisplay: string;
  stops: BolStopRow[];
};

let compiledBolTemplate: HandlebarsTemplateDelegate<BolTemplatePayload> | null = null;
let activeRenders = 0;
const MAX_CONCURRENT_RENDERS = 4;
const renderWaiters: Array<() => void> = [];

function releaseRenderSlot() {
  activeRenders = Math.max(activeRenders - 1, 0);
  const next = renderWaiters.shift();
  if (next) next();
}

async function acquireRenderSlot() {
  if (activeRenders < MAX_CONCURRENT_RENDERS) {
    activeRenders += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    renderWaiters.push(() => {
      activeRenders += 1;
      resolve();
    });
  });
}

async function getBolTemplate() {
  if (compiledBolTemplate) return compiledBolTemplate;
  const templatePath = path.resolve(process.cwd(), "apps/backend/src/dispatch/pdf-template/bol.hbs");
  const source = await readFile(templatePath, "utf8");
  compiledBolTemplate = Handlebars.compile<BolTemplatePayload>(source);
  return compiledBolTemplate;
}

export function formatScheduledWindow(start: string | null | undefined, end: string | null | undefined): string {
  if (!start && !end) return "—";
  const fmt = (value: string | null | undefined) => {
    if (!value) return "";
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toLocaleString() : String(value);
  };
  const a = fmt(start);
  const b = fmt(end);
  if (a && b) return `${a} – ${b}`;
  return a || b || "—";
}

export function buildBolStops(
  rows: Array<{
    stop_type: string;
    sequence_number: number;
    location_name: string | null;
    address_line1: string | null;
    city: string | null;
    state: string | null;
    appointment_start: string | null;
    appointment_end: string | null;
  }>
): BolStopRow[] {
  return rows.map((row) => ({
    stopType: row.stop_type,
    sequence: row.sequence_number,
    locationName: row.location_name ?? "—",
    address: row.address_line1 ?? "—",
    cityState: [row.city, row.state].filter(Boolean).join(", ") || "—",
    scheduledWindow: formatScheduledWindow(row.appointment_start, row.appointment_end),
  }));
}

export async function fetchBolPayload(client: PoolClient, operatingCompanyId: string, loadId: string): Promise<BolTemplatePayload | null> {
  const loadRes = await client.query(
    `
      -- CLS-SCHEMA-DRIFT — this SELECT carried SEVEN phantom columns, so BOTH BOL routes threw 42703
      -- on every call and dispatch.bol_documents has never held a row on prod. All seven verified
      -- absent on br-fancy-credit-akjnd07a 2026-08-07, each against its table's full column count so
      -- the 0s are verdicts and not empty reads:
      --   mdata.loads.commodity_description / .weight_lbs / .reference_number  (98 cols, 0 hits each)
      --   mdata.customers.physical_address_line1                               (109 cols, 0 hits)
      --   org.companies.physical_address_line1 / .display_name                 (33 cols, 0 hits each)
      --   mdata.units.display_id                                               (69 cols, 0 hits)
      -- The org.companies pair was NOT in the phantom-column allowlist — that guard's curated table
      -- list does not cover org.companies — so a fix driven only by the ratchet would have left the
      -- query broken. Reading the whole statement against the live schema is what caught them.
      --
      -- COMMODITY + WEIGHT ARE SOURCED, NOT DEFAULTED. A sweep of every schema for commodity/weight
      -- columns returns exactly one load-linked pair: mdata.unit_border_crossings.commodity and
      -- .cargo_weight_lbs, on a table carrying load_id — the values declared to CBP for this load. For
      -- a Laredo cross-border carrier that is the commodity of record, so the BOL reads it from the
      -- load's most recent crossing instead of inventing one. The old "General freight" default is
      -- dropped below: a BOL is a legal shipping document, and asserting a commodity nobody declared
      -- is worse than the 42703 it replaces.
      --
      -- Every renamed column is aliased back to its original payload key, so the mapping below and
      -- its tests are untouched. Select-list aliases are stripped as BINDINGS by
      -- verify-sql-column-existence, so the aliases create no false positive there.
      SELECT
        l.load_number,
        bc.commodity AS commodity_description,
        bc.cargo_weight_lbs AS weight_lbs,
        l.piece_count,
        l.customer_po_number AS reference_number,
        c.customer_name,
        COALESCE(c.billing_address_line1, c.shipping_address_line1, '') AS customer_address,
        COALESCE(comp.legal_name, comp.short_name, 'IH35 Carrier') AS carrier_name,
        COALESCE(comp.address_line1, '') AS carrier_address,
        concat_ws(' ', d.first_name, d.last_name) AS driver_name,
        u.unit_number AS unit_display
      FROM mdata.loads l
      JOIN mdata.customers c ON c.id = l.customer_id
                             AND c.operating_company_id = $2::uuid
      JOIN org.companies comp ON comp.id = l.operating_company_id
      LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
                                AND (d.operating_company_id = $2::uuid OR EXISTS (
                                  SELECT 1 FROM mdata.driver_company_authorizations bol_driver_dca
                                   WHERE bol_driver_dca.driver_id = d.id
                                     AND bol_driver_dca.company_id = $2::uuid
                                     AND bol_driver_dca.is_authorized = true
                                     AND bol_driver_dca.deactivated_at IS NULL
                                ))
      LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
                              AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $2::uuid
      -- Most recent crossing for THIS load, entity-scoped like every other join here so a commodity
      -- can never be read across entities.
      LEFT JOIN LATERAL (
        SELECT x.commodity, x.cargo_weight_lbs
          FROM mdata.unit_border_crossings x
         WHERE x.load_id = l.id
           AND x.operating_company_id = $2::uuid
         ORDER BY x.crossing_date DESC
         LIMIT 1
      ) bc ON TRUE
      WHERE l.id = $1::uuid
        AND l.operating_company_id = $2::uuid
        AND l.soft_deleted_at IS NULL
      LIMIT 1
    `,
    [loadId, operatingCompanyId]
  );
  const load = loadRes.rows[0];
  if (!load) return null;

  const stopsRes = await client.query(
    `
      -- CLS-SCHEMA-DRIFT + LINKAGE — two defects here, and fixing only the first would have shipped a
      -- BOL that still prints no addresses.
      --
      -- (1) PHANTOM COLUMNS: s.appointment_start / s.appointment_end do not exist. Prod-verified
      --     2026-08-07: mdata.load_stops has 37 columns and 0 hits for either; the real names are
      --     appointment_start_at / appointment_end_at. Aliased back to the original payload keys so
      --     buildBolStops and its test are untouched.
      --
      -- (2) THE ADDRESS JOIN RESOLVED TO NOTHING. mdata.load_stops carries BOTH a location_id FK and
      --     its own inline address_line1 / city / state, and prod uses the INLINE columns: 20 of 20
      --     stops have location_id NULL, while 20 of 20 have city, 20 of 20 have state and 16 of 20
      --     have address_line1. Reading the address only through mdata.locations returned NULL for
      --     every stop on every load — the BOL would have rendered "—" for each one with the data
      --     sitting on the row it already had. The NULLIFs stop an empty string from beating a real
      --     value in either direction; several stops carry '' rather than NULL.
      --
      -- The locations join is KEPT, not replaced: a stop that IS linked should prefer the location
      -- master, and 27 rows are waiting in mdata.locations.
      SELECT
        s.stop_type::text,
        s.sequence_number,
        loc.location_name,
        COALESCE(NULLIF(loc.address_line1, ''), NULLIF(s.address_line1, '')) AS address_line1,
        COALESCE(NULLIF(loc.city, ''), NULLIF(s.city, '')) AS city,
        COALESCE(NULLIF(loc.state, ''), NULLIF(s.state, '')) AS state,
        s.appointment_start_at::text AS appointment_start,
        s.appointment_end_at::text AS appointment_end
      FROM mdata.load_stops s
      LEFT JOIN mdata.locations loc ON loc.id = s.location_id AND loc.operating_company_id = $2::uuid
      WHERE s.load_id = $1::uuid
      ORDER BY s.sequence_number ASC
    `,
    [loadId, operatingCompanyId]
  );

  return {
    loadNumber: String(load.load_number ?? loadId.slice(0, 8)),
    generatedAt: new Date().toLocaleString(),
    templateVersion: "B21-D10-v1",
    carrierName: String(load.carrier_name ?? "IH35 Carrier"),
    carrierAddress: String(load.carrier_address ?? ""),
    customerName: String(load.customer_name ?? "—"),
    customerAddress: String(load.customer_address ?? ""),
    // "General freight" was the old default and it is deliberately gone. A BOL is a legal shipping
    // document; printing a commodity the system never captured is a fabricated assertion on a
    // carrier's paperwork. The value now comes from the load's border-crossing declaration, and when
    // there is none the BOL says so.
    commodity: String(load.commodity_description ?? "—"),
    weight: load.weight_lbs != null ? `${load.weight_lbs} lbs` : "—",
    pieces: load.piece_count != null ? String(load.piece_count) : "—",
    referenceNumber: String(load.reference_number ?? "—"),
    driverName: String(load.driver_name ?? "—"),
    unitDisplay: String(load.unit_display ?? "—"),
    stops: buildBolStops(stopsRes.rows),
  };
}

export async function generateBolPdf(payload: BolTemplatePayload) {
  await acquireRenderSlot();
  const template = await getBolTemplate();
  try {
    const html = template(payload);
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: "load" });
      const pdf = await page.pdf({ format: "Letter", printBackground: true });
      const pdfBuffer = Buffer.from(pdf);
      return {
        pdfBuffer,
        html,
        filename: `bol-${payload.loadNumber}.pdf`,
        mimeType: "application/pdf",
        sha256: crypto.createHash("sha256").update(pdfBuffer).digest("hex"),
        templateVersion: payload.templateVersion,
      };
    } finally {
      await browser.close();
    }
  } finally {
    releaseRenderSlot();
  }
}

export async function storeBolDocument(
  client: PoolClient,
  operatingCompanyId: string,
  loadId: string,
  userId: string | null,
  pdfBuffer: Buffer,
  sha256: string,
  templateVersion: string
) {
  if (!isR2Configured()) throw new Error("r2_not_configured");
  const r2Key = `dispatch/bol/${operatingCompanyId}/${loadId}/${randomUUID()}.pdf`;
  await putObjectBytes(r2Key, pdfBuffer, "application/pdf");

  try {
    const res = await client.query(
      `
        INSERT INTO dispatch.bol_documents (
          operating_company_id, load_id, pdf_r2_key, sha256, generated_by_user_id, template_version
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6)
        RETURNING id::text, pdf_r2_key, sha256, generated_at::text, template_version
      `,
      [operatingCompanyId, loadId, r2Key, sha256, userId, templateVersion]
    );
    const stored = res.rows[0];
    if (!stored?.id) throw new Error("bol_document_create_failed");
    return stored;
  } catch (error) {
    try {
      await deleteObjectBytes(r2Key);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], `bol_document_cleanup_failed:${r2Key}`);
    }
    throw error;
  }
}

export async function generateAndStoreBol(client: PoolClient, operatingCompanyId: string, loadId: string, userId: string | null) {
  const payload = await fetchBolPayload(client, operatingCompanyId, loadId);
  if (!payload) return null;
  const rendered = await generateBolPdf(payload);
  const stored = await storeBolDocument(client, operatingCompanyId, loadId, userId, rendered.pdfBuffer, rendered.sha256, rendered.templateVersion);
  return { ...stored, filename: rendered.filename };
}
