import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Handlebars from "handlebars";
import puppeteer from "puppeteer";
import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { putObjectBytes, isR2Configured } from "../storage/r2-client.js";

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
      SELECT
        l.load_number,
        l.commodity_description,
        l.weight_lbs,
        l.piece_count,
        l.reference_number,
        c.customer_name,
        COALESCE(c.billing_address_line1, c.physical_address_line1, '') AS customer_address,
        COALESCE(comp.legal_name, comp.display_name, 'IH35 Carrier') AS carrier_name,
        COALESCE(comp.physical_address_line1, '') AS carrier_address,
        concat_ws(' ', d.first_name, d.last_name) AS driver_name,
        u.display_id AS unit_display
      FROM mdata.loads l
      JOIN mdata.customers c ON c.id = l.customer_id
      JOIN org.companies comp ON comp.id = l.operating_company_id
      LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
      LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
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
      SELECT
        s.stop_type::text,
        s.sequence_number,
        loc.location_name,
        loc.address_line1,
        loc.city,
        loc.state,
        s.appointment_start::text,
        s.appointment_end::text
      FROM mdata.load_stops s
      LEFT JOIN mdata.locations loc ON loc.id = s.location_id
      WHERE s.load_id = $1::uuid
      ORDER BY s.sequence_number ASC
    `,
    [loadId]
  );

  return {
    loadNumber: String(load.load_number ?? loadId.slice(0, 8)),
    generatedAt: new Date().toLocaleString(),
    templateVersion: "B21-D10-v1",
    carrierName: String(load.carrier_name ?? "IH35 Carrier"),
    carrierAddress: String(load.carrier_address ?? ""),
    customerName: String(load.customer_name ?? "—"),
    customerAddress: String(load.customer_address ?? ""),
    commodity: String(load.commodity_description ?? "General freight"),
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
  return res.rows[0];
}

export async function generateAndStoreBol(client: PoolClient, operatingCompanyId: string, loadId: string, userId: string | null) {
  const payload = await fetchBolPayload(client, operatingCompanyId, loadId);
  if (!payload) return null;
  const rendered = await generateBolPdf(payload);
  const stored = await storeBolDocument(client, operatingCompanyId, loadId, userId, rendered.pdfBuffer, rendered.sha256, rendered.templateVersion);
  return { ...stored, filename: rendered.filename };
}
