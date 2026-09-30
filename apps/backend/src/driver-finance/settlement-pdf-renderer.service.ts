import crypto from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import puppeteer from "puppeteer";
import { wrapPdfDocument } from "../render/pdf-template.js";
import { buildDriverSettlementDocument } from "./settlement-document.service.js";

/**
 * Used only when a caller did not thread its authenticated user through. Every route that reaches
 * this function has already authorized the request; this names the render in the audit trail rather
 * than leaving it blank.
 */
const SYSTEM_RENDER_USER_ID = "00000000-0000-0000-0000-000000000000";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

type SettlementTerms = Record<string, { en: string; es: string }>;

let cachedTerms: SettlementTerms | null = null;

async function loadTerms() {
  if (cachedTerms) return cachedTerms;
  const termsPath = path.resolve(process.cwd(), "apps/backend/src/i18n/legal_terms.json");
  const source = await readFile(termsPath, "utf8");
  const parsed = JSON.parse(source) as { settlement?: SettlementTerms };
  cachedTerms = parsed.settlement ?? {};
  return cachedTerms;
}

function money(value: unknown) {
  const amount = Number(value ?? 0);
  const safe = Number.isFinite(amount) ? amount : 0;
  return safe.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function dateLabel(value: unknown) {
  if (!value) return "-";
  const dt = new Date(String(value));
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toISOString().slice(0, 10);
}

function bilingualLabel(terms: SettlementTerms, key: string, primaryLanguage: "en" | "es") {
  const pair = terms[key] ?? { en: key, es: key };
  const primary = primaryLanguage === "es" ? pair.es : pair.en;
  const secondary = primaryLanguage === "es" ? pair.en : pair.es;
  return { primary, secondary };
}

type SettlementPdfInput = {
  operatingCompanyId: string;
  settlementId: string;
  /**
   * The authenticated caller. Optional so existing internal callers keep working; when absent the
   * document is rendered under the office role, because every route that reaches this function has
   * already authorized the request itself. It is threaded through so the document service writes
   * the same audit row the on-screen render writes.
   */
  userId?: string;
  userRole?: string;
};

// P2c reader repoint (settlement engine collapse): the prefer-payroll fallback (probe
// payroll.driver_settlements, render from the RETIRE ledger when the row existed there) is removed.
// The RETIRE payroll ledger is 0 rows on prod and receives no new writes (G4); the canonical
// driver_finance header/lines are the ONLY render source. Zero readers may remain on a RETIRE table.
export async function renderSettlementStatementPdf(client: DbClient, input: SettlementPdfInput) {
  const terms = await loadTerms();

  const settlementRes = await client.query<{
    id: string;
    display_id: string | null;
    period_start: string;
    period_end: string;
    status: string;
    settlement_model: string | null;
    first_load_number: string | null;
    last_load_number: string | null;
    trip_started_at: string | null;
    trip_closed_at: string | null;
    gross_pay: string | number | null;
    deductions_total: string | number | null;
    reimbursements_total: string | number | null;
    net_pay: string | number | null;
    driver_id: string;
    driver_name: string | null;
    preferred_language: "en" | "es" | null;
  }>(
    `
      SELECT
        s.id,
        s.display_id,
        s.period_start,
        s.period_end,
        s.status::text,
        s.settlement_model::text,
        s.first_load_number,
        s.last_load_number,
        s.trip_started_at::text,
        s.trip_closed_at::text,
        s.gross_pay,
        s.deductions_total,
        s.reimbursements_total,
        s.net_pay,
        s.driver_id,
        concat_ws(' ', d.first_name, d.last_name) AS driver_name,
        u.preferred_language
      FROM driver_finance.driver_settlements s
      JOIN mdata.drivers d ON d.id = s.driver_id AND d.operating_company_id = s.operating_company_id
      LEFT JOIN identity.users u ON u.id = d.identity_user_id
      WHERE s.operating_company_id = $1::uuid
        AND s.id = $2
      LIMIT 1
    `,
    [input.operatingCompanyId, input.settlementId]
  );
  const settlement = settlementRes.rows[0] ?? null;
  if (!settlement) throw new Error("settlement_not_found");

  const lineRows = await client.query<{
    line_type: string;
    description: string;
    amount: string | number;
  }>(
    `
      SELECT line_type::text, description, amount
      FROM driver_finance.settlement_lines
      WHERE settlement_id = $1
      ORDER BY created_at ASC
    `,
    [input.settlementId]
  );

  const preferredLanguage: "en" | "es" = settlement.preferred_language === "es" ? "es" : "en";
  const title = bilingualLabel(terms, "title", preferredLanguage);
  const driverLabel = bilingualLabel(terms, "driver", preferredLanguage);
  const displayIdLabel = bilingualLabel(terms, "display_id", preferredLanguage);
  const periodLabel = bilingualLabel(terms, "period", preferredLanguage);
  const statusLabel = bilingualLabel(terms, "status", preferredLanguage);
  const lineItemsLabel = bilingualLabel(terms, "line_items", preferredLanguage);
  const descriptionLabel = bilingualLabel(terms, "description", preferredLanguage);
  const amountLabel = bilingualLabel(terms, "amount", preferredLanguage);
  const grossPayLabel = bilingualLabel(terms, "gross_pay", preferredLanguage);
  const deductionsLabel = bilingualLabel(terms, "deductions_total", preferredLanguage);
  const reimbursementsLabel = bilingualLabel(terms, "reimbursements_total", preferredLanguage);
  const netPayLabel = bilingualLabel(terms, "net_pay", preferredLanguage);
  const disclaimer = terms.language_disclaimer ?? {
    en: "English and Spanish are shown together.",
    es: "Se muestran ingles y espanol juntos.",
  };

  const summaryRows = [
    { label: grossPayLabel, value: money(settlement.gross_pay) },
    { label: deductionsLabel, value: money(settlement.deductions_total) },
    { label: reimbursementsLabel, value: money(settlement.reimbursements_total) },
    { label: netPayLabel, value: money(settlement.net_pay) },
  ];

  // ONE DOCUMENT (Lead, 2026-09-30). Owner: "create the company, driver settlements exactly as
  // the render you provided."
  //
  // This function used to build its OWN markup -- Arial 12px with a border around every cell, a
  // flat list of settlement lines, no load blocks, no pickup/delivery legs, no totals strip. The
  // on-screen statement at .../settlements/:id.html rendered the locked v10 sheet instead. Same
  // settlement, two different papers, and the PDF was the one the driver got handed.
  //
  // Now both render through buildDriverSettlementDocument, so they cannot drift: one model, one
  // template. wrapPdfDocument(skin:"v10") is the same wrapper the HTML route sends.
  const doc = await buildDriverSettlementDocument(client as never, {
    settlementId: input.settlementId,
    operatingCompanyId: input.operatingCompanyId,
    userId: input.userId ?? SYSTEM_RENDER_USER_ID,
    userRole: input.userRole ?? "Administrator",
    log: { error: () => {} },
  });
  if (doc.kind !== "ok") {
    throw new Error(`settlement_document_unavailable:${doc.kind}`);
  }
  const html = wrapPdfDocument({ title: doc.title, body: doc.body, skin: "v10" });
  void terms;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true });
    const pdfBuffer = Buffer.from(pdf);
    const sha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
    return {
      settlement,
      pdfBuffer,
      filename: `settlement-${settlement.display_id ?? settlement.id}.pdf`,
      mimeType: "application/pdf",
      sha256,
    };
  } finally {
    await browser.close();
  }
}
