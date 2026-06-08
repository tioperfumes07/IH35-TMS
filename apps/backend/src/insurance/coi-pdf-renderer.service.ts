import crypto from "node:crypto";
import puppeteer from "puppeteer";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

type CoveredUnit = {
  unit_code: string | null;
  asset_type: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  insured_value_cents: number | null;
};

type CoiPdfModel = {
  companyLegalName: string;
  companyAddress: string;
  companyPhone: string;
  insurerName: string;
  policyNumber: string;
  coverageType: string;
  effectiveDate: string;
  expiryDate: string;
  units: CoveredUnit[];
  totalInsuredValueCents: number;
  generatedAt: string;
};

function esc(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function fmtMoney(cents: number | null | undefined): string {
  const n = Number(cents ?? 0);
  if (!Number.isFinite(n)) return "—";
  return (n / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function coverageLabel(code: string): string {
  const labels: Record<string, string> = {
    auto_liability: "Commercial Auto Liability",
    physical_damage: "Physical Damage",
    cargo: "Motor Truck Cargo",
    general_liability: "General Liability",
    workers_comp: "Workers Compensation",
    trailer_interchange: "Trailer Interchange",
    bobtail: "Bobtail / Non-Dispatch",
    non_trucking_liability: "Non-Trucking Liability",
    umbrella: "Commercial Umbrella",
    excess_liability: "Excess Liability",
    occupational_accident: "Occupational Accident",
    garage_keepers: "Garage Keepers",
    reefer_breakdown: "Reefer Breakdown",
    pollution: "Pollution Liability",
    cyber_liability: "Cyber Liability",
  };
  return labels[code] ?? code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderHtml(model: CoiPdfModel): string {
  const unitRows = model.units.length
    ? model.units
        .map(
          (u) => `
        <tr>
          <td>${esc(u.unit_code ?? "—")}</td>
          <td>${esc(u.asset_type ?? "—")}</td>
          <td>${esc(u.year ? String(u.year) : "—")}</td>
          <td>${esc(u.make ?? "—")}</td>
          <td>${esc(u.model ?? "—")}</td>
          <td>${esc(u.vin ?? "—")}</td>
          <td class="num">${fmtMoney(u.insured_value_cents)}</td>
        </tr>`
        )
        .join("")
    : `<tr><td colspan="7" class="empty">No units assigned to this policy.</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Certificate of Insurance — ${esc(model.policyNumber)}</title>
<style>
  @page { size: Letter; margin: 0.6in 0.65in; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #0f172a; margin: 0; line-height: 1.4; }
  h1 { font-size: 18px; font-weight: 700; margin: 0 0 2px; letter-spacing: -0.3px; }
  h2 { font-size: 12px; font-weight: 700; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.5px; color: #374151; border-bottom: 1px solid #d1d5db; padding-bottom: 3px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
  .header-left .subtitle { font-size: 11px; color: #6b7280; margin: 2px 0 6px; }
  .header-left .company { font-size: 11px; color: #374151; margin: 0; }
  .header-right { text-align: right; }
  .badge { display: inline-block; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 3px 8px; border-radius: 3px; background: #1e40af; color: #fff; }
  .gen-date { font-size: 9px; color: #9ca3af; margin-top: 4px; }
  .section { margin-bottom: 14px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px 20px; }
  .field { }
  .field .lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #6b7280; margin-bottom: 1px; }
  .field .val { font-size: 12px; font-weight: 600; color: #0f172a; }
  .field .val.mono { font-family: "Courier New", monospace; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  thead th { background: #f1f5f9; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #475569; padding: 5px 6px; text-align: left; border: 1px solid #e2e8f0; }
  tbody td { padding: 5px 6px; border: 1px solid #e2e8f0; font-size: 10px; color: #1e293b; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  td.num, th.num { text-align: right; }
  td.empty { text-align: center; color: #94a3b8; font-style: italic; }
  .total-row { display: flex; justify-content: flex-end; margin-top: 6px; }
  .total-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 4px; padding: 6px 14px; }
  .total-box .lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #3b82f6; }
  .total-box .val { font-size: 15px; font-weight: 700; color: #1d4ed8; }
  .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #94a3b8; text-align: center; }
  .divider { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <h1>Certificate of Insurance</h1>
    <p class="subtitle">Commercial Motor Carrier — Policy Summary</p>
    <p class="company">${esc(model.companyLegalName)}${model.companyAddress ? ` &nbsp;·&nbsp; ${esc(model.companyAddress)}` : ""}${model.companyPhone ? ` &nbsp;·&nbsp; ${esc(model.companyPhone)}` : ""}</p>
  </div>
  <div class="header-right">
    <span class="badge">Certificate of Insurance</span>
    <div class="gen-date">Generated: ${esc(model.generatedAt)}</div>
  </div>
</div>

<hr class="divider"/>

<div class="section">
  <h2>Policy Information</h2>
  <div class="grid3">
    <div class="field">
      <div class="lbl">Insurer / Carrier</div>
      <div class="val">${esc(model.insurerName)}</div>
    </div>
    <div class="field">
      <div class="lbl">Policy Number</div>
      <div class="val mono">${esc(model.policyNumber)}</div>
    </div>
    <div class="field">
      <div class="lbl">Coverage Type</div>
      <div class="val">${esc(coverageLabel(model.coverageType))}</div>
    </div>
    <div class="field">
      <div class="lbl">Effective Date</div>
      <div class="val">${esc(fmtDate(model.effectiveDate))}</div>
    </div>
    <div class="field">
      <div class="lbl">Expiry Date</div>
      <div class="val">${esc(fmtDate(model.expiryDate))}</div>
    </div>
    <div class="field">
      <div class="lbl">Total Premium</div>
      <div class="val">—</div>
    </div>
  </div>
</div>

<hr class="divider"/>

<div class="section">
  <h2>Covered Units (${model.units.length})</h2>
  <table>
    <thead>
      <tr>
        <th>Unit #</th>
        <th>Type</th>
        <th>Year</th>
        <th>Make</th>
        <th>Model</th>
        <th>VIN</th>
        <th class="num">Insured Value</th>
      </tr>
    </thead>
    <tbody>
      ${unitRows}
    </tbody>
  </table>

  <div class="total-row">
    <div class="total-box">
      <div class="lbl">Total Insured Value</div>
      <div class="val">${esc(fmtMoney(model.totalInsuredValueCents))}</div>
    </div>
  </div>
</div>

<div class="footer">
  This certificate is issued as a matter of information only and confers no rights upon the certificate holder.
  This document does not amend, extend, or alter the coverage afforded by the policy described herein.
  Verify coverage directly with the insurer for the most current information.
</div>

</body>
</html>`;
}

export async function renderCoiPdf(
  client: Queryable,
  opts: { policyId: string; operatingCompanyId: string }
) {
  const policyRes = await client.query<{
    id: string;
    insurer_name: string;
    policy_number: string;
    coverage_type: string;
    effective_date: string;
    expiry_date: string;
    status: string;
  }>(
    `
      SELECT
        id::text,
        insurer_name,
        policy_number,
        coverage_type,
        effective_date::text,
        expiry_date::text,
        status
      FROM insurance.policy
      WHERE tenant_id = $1::uuid
        AND id = $2::uuid
      LIMIT 1
    `,
    [opts.operatingCompanyId, opts.policyId]
  );
  const policy = policyRes.rows[0];
  if (!policy) return null;

  const unitsRes = await client.query<{
    unit_code: string | null;
    asset_type: string | null;
    vin: string | null;
    make: string | null;
    model: string | null;
    year: number | null;
    insured_value_cents: number | null;
  }>(
    `
      SELECT
        a.unit_code,
        a.asset_type,
        a.vin,
        a.make,
        a.model,
        a.year::int,
        pu.insured_value_cents::bigint AS insured_value_cents
      FROM insurance.policy_unit pu
      JOIN mdata.assets a ON a.id = pu.asset_id AND a.tenant_id = pu.tenant_id
      WHERE pu.tenant_id = $1::uuid
        AND pu.policy_id = $2::uuid
      ORDER BY a.unit_code ASC, a.created_at ASC
    `,
    [opts.operatingCompanyId, opts.policyId]
  );

  const companyRes = await client.query<{
    legal_name: string | null;
    address_line1: string | null;
    city: string | null;
    state: string | null;
    phone: string | null;
  }>(
    `
      SELECT legal_name, address_line1, city, state, phone
      FROM org.companies
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [opts.operatingCompanyId]
  );
  const company = companyRes.rows[0] ?? {};

  const companyAddress = [company.address_line1, company.city, company.state]
    .filter(Boolean)
    .join(", ");

  const units = unitsRes.rows;
  const totalInsuredValueCents = units.reduce(
    (sum, u) => sum + Number(u.insured_value_cents ?? 0),
    0
  );

  const model: CoiPdfModel = {
    companyLegalName: company.legal_name ?? "—",
    companyAddress,
    companyPhone: company.phone ?? "",
    insurerName: policy.insurer_name,
    policyNumber: policy.policy_number,
    coverageType: policy.coverage_type,
    effectiveDate: policy.effective_date,
    expiryDate: policy.expiry_date,
    units,
    totalInsuredValueCents,
    generatedAt: new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
  };

  const html = renderHtml(model);

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
    const safePolicyNum = policy.policy_number.replace(/[^a-zA-Z0-9\-_]/g, "_");
    return {
      pdfBuffer,
      filename: `coi-${safePolicyNum}.pdf`,
      mimeType: "application/pdf" as const,
      sha256,
    };
  } finally {
    await browser.close();
  }
}
