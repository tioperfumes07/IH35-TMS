import crypto from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import puppeteer from "puppeteer";

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
};

export async function renderSettlementStatementPdf(client: DbClient, input: SettlementPdfInput) {
  const terms = await loadTerms();
  const payrollExistsRes = await client.query<{ ok: boolean }>(`SELECT to_regclass('payroll.driver_settlements') IS NOT NULL AS ok`);
  const payrollExists = Boolean(payrollExistsRes.rows[0]?.ok);

  const payrollSettlementRes = payrollExists
    ? await client.query<{
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
            s.id::text AS id,
            ('PS-' || upper(substr(s.id::text, 1, 8)))::text AS display_id,
            s.pay_period_start::text AS period_start,
            s.pay_period_end::text AS period_end,
            s.status::text AS status,
            NULL::text AS settlement_model,
            NULL::text AS first_load_number,
            NULL::text AS last_load_number,
            NULL::text AS trip_started_at,
            NULL::text AS trip_closed_at,
            (s.gross_cents::numeric / 100.0)::text AS gross_pay,
            (s.deductions_cents::numeric / 100.0)::text AS deductions_total,
            0::text AS reimbursements_total,
            (s.net_cents::numeric / 100.0)::text AS net_pay,
            s.driver_id::text AS driver_id,
            concat_ws(' ', d.first_name, d.last_name) AS driver_name,
            u.preferred_language
          FROM payroll.driver_settlements s
          JOIN mdata.drivers d ON d.id = s.driver_id
          LEFT JOIN identity.users u ON u.id = d.identity_user_id
          WHERE s.operating_company_id = $1::uuid
            AND s.id = $2::uuid
          LIMIT 1
        `,
        [input.operatingCompanyId, input.settlementId]
      )
    : { rows: [] };

  const settlementRes = payrollSettlementRes.rows[0]
    ? payrollSettlementRes
    : await client.query<{
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
      JOIN mdata.drivers d ON d.id = s.driver_id
      LEFT JOIN identity.users u ON u.id = d.identity_user_id
      WHERE s.operating_company_id = $1
        AND s.id = $2
      LIMIT 1
    `,
    [input.operatingCompanyId, input.settlementId]
  );
  const settlement = settlementRes.rows[0] ?? null;
  if (!settlement) throw new Error("settlement_not_found");

  const payrollLines = payrollSettlementRes.rows[0]
    ? await client.query<{
        line_type: string;
        description: string;
        amount: string | number;
      }>(
        `
          SELECT
            line_type::text,
            description,
            (amount_cents::numeric / 100.0)::text AS amount
          FROM payroll.driver_settlement_line_items
          WHERE settlement_id = $1::uuid
          ORDER BY created_at ASC
        `,
        [input.settlementId]
      )
    : null;

  const lineRows = payrollLines
    ? payrollLines
    : await client.query<{
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

  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: Letter; margin: 0.55in; }
        body { font-family: Arial, sans-serif; color: #0f172a; font-size: 12px; line-height: 1.45; }
        h1, h2 { margin: 0; }
        .header { margin-bottom: 14px; }
        .label-primary { font-weight: 700; }
        .label-secondary { font-size: 10px; color: #64748b; margin-top: 2px; }
        .summary, .lines { width: 100%; border-collapse: collapse; margin-top: 10px; }
        .summary td, .lines th, .lines td { border: 1px solid #d1d5db; padding: 7px; vertical-align: top; }
        .lines th { background: #f8fafc; text-align: left; }
        .amount { text-align: right; white-space: nowrap; }
        .section-title { margin-top: 14px; font-size: 13px; }
        .footer { margin-top: 16px; font-size: 10px; color: #334155; border-top: 1px solid #e2e8f0; padding-top: 8px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${title.primary}</h1>
        <div class="label-secondary">${title.secondary}</div>
      </div>

      <table class="summary">
        <tr>
          <td>
            <div class="label-primary">${driverLabel.primary}</div>
            <div class="label-secondary">${driverLabel.secondary}</div>
          </td>
          <td>${settlement.driver_name ?? "-"}</td>
        </tr>
        <tr>
          <td>
            <div class="label-primary">${displayIdLabel.primary}</div>
            <div class="label-secondary">${displayIdLabel.secondary}</div>
          </td>
          <td>${settlement.display_id ?? settlement.id}</td>
        </tr>
        <tr>
          <td>
            <div class="label-primary">${periodLabel.primary}</div>
            <div class="label-secondary">${periodLabel.secondary}</div>
          </td>
          <td>${dateLabel(settlement.period_start)} - ${dateLabel(settlement.period_end)}</td>
        </tr>
        <tr>
          <td>
            <div class="label-primary">${statusLabel.primary}</div>
            <div class="label-secondary">${statusLabel.secondary}</div>
          </td>
          <td>${settlement.status}</td>
        </tr>
        ${
          settlement.settlement_model === "load_bookended"
            ? `
        <tr>
          <td><div class="label-primary">Settlement model</div></td>
          <td>Load-bookended trip</td>
        </tr>
        <tr>
          <td><div class="label-primary">First load</div></td>
          <td>${settlement.first_load_number ?? "—"}</td>
        </tr>
        <tr>
          <td><div class="label-primary">Last load</div></td>
          <td>${settlement.last_load_number ?? "—"}</td>
        </tr>
        <tr>
          <td><div class="label-primary">Trip window</div></td>
          <td>${dateLabel(settlement.trip_started_at)} → ${dateLabel(settlement.trip_closed_at)}</td>
        </tr>`
            : ""
        }
      </table>

      <h2 class="section-title">${lineItemsLabel.primary}</h2>
      <div class="label-secondary">${lineItemsLabel.secondary}</div>
      <table class="lines">
        <thead>
          <tr>
            <th>
              <div class="label-primary">${descriptionLabel.primary}</div>
              <div class="label-secondary">${descriptionLabel.secondary}</div>
            </th>
            <th class="amount">
              <div class="label-primary">${amountLabel.primary}</div>
              <div class="label-secondary">${amountLabel.secondary}</div>
            </th>
          </tr>
        </thead>
        <tbody>
          ${
            lineRows.rows.length === 0
              ? `<tr><td colspan="2">No settlement lines recorded.</td></tr>`
              : lineRows.rows
                  .map((line) => `<tr><td>${line.description}</td><td class="amount">${money(line.amount)}</td></tr>`)
                  .join("")
          }
        </tbody>
      </table>

      <table class="summary">
        ${summaryRows
          .map(
            (row) => `
          <tr>
            <td>
              <div class="label-primary">${row.label.primary}</div>
              <div class="label-secondary">${row.label.secondary}</div>
            </td>
            <td class="amount">${row.value}</td>
          </tr>
        `
          )
          .join("")}
      </table>

      <div class="footer">
        <div>${disclaimer.en}</div>
        <div>${disclaimer.es}</div>
      </div>
    </body>
  </html>`;

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
