import crypto from "node:crypto";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

type GenerateForm425CPdfInput = {
  client: DbClient;
  userId: string;
  reportId: string;
  operatingCompanyId: string;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const QUESTIONNAIRE = [
  [1, "Did the business operate during the entire reporting period?", true],
  [2, "Do you plan to continue to operate the business next month?", true],
  [3, "Have you paid all of your bills on time?", true],
  [4, "Did you pay your employees on time?", true],
  [5, "Have you deposited all the receipts for your business into debtor in possession (DIP) accounts?", true],
  [6, "Have you timely filed your tax returns and paid all of your taxes?", true],
  [7, "Have you timely filed all other required government filings?", true],
  [8, "Are you current on your quarterly fee payments to the U.S. Trustee or Bankruptcy Administrator?", true],
  [9, "Have you timely paid all of your insurance premiums?", true],
  [10, "Do you have any bank accounts open other than the DIP accounts?", false],
  [11, "Have you sold any assets other than inventory?", false],
  [12, "Have you sold or transferred any assets or provided services to anyone related to the DIP in any way?", false],
  [13, "Did any insurance company cancel your policy?", false],
  [14, "Did you have any unusual or significant unanticipated expenses?", false],
  [15, "Have you borrowed money from anyone or has anyone made any payments on your behalf?", false],
  [16, "Has anyone made an investment in your business?", false],
  [17, "Have you paid any bills you owed before you filed bankruptcy?", false],
  [18, "Have you allowed any checks to clear the bank that were issued before you filed bankruptcy?", false],
] as const;

function nv(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmt(v: unknown) {
  return nv(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function labelForMonth(monthDate: string) {
  const d = new Date(monthDate);
  if (Number.isNaN(d.getTime())) return monthDate;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function buildPrintHTML(report: Record<string, unknown>, profile: Record<string, unknown> | undefined) {
  const part1 = (report.part1_answers as Record<string, string>) ?? {};
  const part2 = (report.part2_answers as Record<string, string>) ?? {};
  const answers = { ...part1, ...part2 };
  const netCash = nv(report.line_20_receipts) - nv(report.line_21_disbursements);
  const cashEnd = nv(report.line_19_opening_cash) + netCash;
  const projNetPrev = nv(report.line_32_proj_receipts) - nv(report.line_33_proj_disbursements);
  const pDR = nv(report.line_32_proj_receipts) - nv(report.line_20_receipts);
  const pDD = nv(report.line_33_proj_disbursements) - nv(report.line_21_disbursements);
  const pDN = projNetPrev - netCash;
  const projNetNext = nv(report.line_35_next_proj_receipts) - nv(report.line_36_next_proj_disbursements);

  const mrow = (line: number, label: string, value: string) =>
    `<tr><td style="padding:4px 8px;border-bottom:1px solid #dde4ee;"><strong>${line}.</strong> ${label}</td><td style="padding:4px 8px;border-left:1px solid #dde4ee;border-bottom:1px solid #dde4ee;text-align:right;">$${value}</td></tr>`;
  const qrow = (num: number, text: string, expectYes: boolean) => {
    const ans = String(answers[String(num)] ?? (expectYes ? "yes" : "no"));
    const flagged = (expectYes && ans === "no") || (!expectYes && ans === "yes");
    return `<tr style="${flagged ? "background:#fff8f8;" : ""}"><td style="padding:4px 8px;border-bottom:1px solid #dde4ee;">${num}. ${text}${flagged ? " <em style='color:#c00'>[Exhibit required]</em>" : ""}</td><td style="padding:4px 8px;border-left:1px solid #dde4ee;border-bottom:1px solid #dde4ee;text-align:center;">${ans.toUpperCase()}</td></tr>`;
  };

  return `<!doctype html><html><head><meta charset="utf-8" /><style>@page{size:letter;margin:.5in}.section{background:#1e3a6a;color:#fff;padding:4px 8px;margin-top:8px;font-weight:700}table{width:100%;border-collapse:collapse}body{font-family:Arial,sans-serif;font-size:12px}</style></head><body>
  <h2 style="margin:0">Official Form 425C — Monthly Operating Report</h2>
  <div style="margin:4px 0 10px;color:#334155;">${String(profile?.company_name ?? "Debtor")} · ${labelForMonth(String(report.reporting_month ?? ""))}</div>

  <div class="section">1. Questionnaire</div>
  <table style="border:1px solid #cbd5e1">${QUESTIONNAIRE.map(([n, t, ey]) => qrow(n, t, ey)).join("")}</table>

  <div class="section">2. Summary of Cash Activity</div>
  <table style="border:1px solid #cbd5e1">
    ${mrow(19, "Total opening balance of all accounts", fmt(report.line_19_opening_cash))}
    ${mrow(20, "Total cash receipts", fmt(report.line_20_receipts))}
    ${mrow(21, "Total cash disbursements", fmt(report.line_21_disbursements))}
    ${mrow(22, "Net cash flow (line 20 - line 21)", fmt(netCash))}
    ${mrow(23, "Cash on hand at end of month (line 19 + line 22)", fmt(cashEnd))}
  </table>

  <div class="section">3-6. Core Amounts</div>
  <table style="border:1px solid #cbd5e1">
    ${mrow(24, "Total payables", fmt(report.line_24_payables))}
    ${mrow(25, "Total receivables", fmt(report.line_25_receivables))}
    ${mrow(28, "Professional fees this month", fmt(report.line_28_bk_fees_this_month))}
    ${mrow(29, "Professional fees since filing", fmt(report.line_29_bk_fees_since_filing))}
    ${mrow(30, "Other professional fees this month", fmt(report.line_30_other_fees_this_month))}
    ${mrow(31, "Other professional fees since filing", fmt(report.line_31_other_fees_since_filing))}
  </table>

  <div class="section">7. Projections</div>
  <table style="border:1px solid #cbd5e1">
    ${mrow(32, "Projected receipts (Column A)", fmt(report.line_32_proj_receipts))}
    ${mrow(33, "Projected disbursements (Column A)", fmt(report.line_33_proj_disbursements))}
    ${mrow(34, "Projected net cash flow", fmt(projNetPrev))}
    ${mrow(34, "Difference receipts (A-B)", fmt(pDR))}
    ${mrow(34, "Difference disbursements (A-B)", fmt(pDD))}
    ${mrow(34, "Difference net (A-B)", fmt(pDN))}
    ${mrow(35, "Next month projected receipts", fmt(report.line_35_next_proj_receipts))}
    ${mrow(36, "Next month projected disbursements", fmt(report.line_36_next_proj_disbursements))}
    ${mrow(37, "Next month projected net", fmt(projNetNext))}
  </table>
</body></html>`;
}

export async function generateForm425CPdf({ client, userId, reportId, operatingCompanyId }: GenerateForm425CPdfInput) {
  const reportRes = await client.query(
    `
      SELECT *
      FROM compliance.form_425c_reports
      WHERE id = $1
        AND operating_company_id = $2
      LIMIT 1
    `,
    [reportId, operatingCompanyId]
  );
  const report = reportRes.rows[0];
  if (!report) throw new Error("form_425c_report_not_found");

  const profileRes = await client.query(
    `
      SELECT *
      FROM catalogs.form_425c_company_profiles
      WHERE operating_company_id = $1
      ORDER BY CASE company_key WHEN 'trucking' THEN 1 ELSE 2 END
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  const profile = profileRes.rows[0];

  const printHtml = buildPrintHTML(report, profile);
  const htmlBuffer = Buffer.from(printHtml, "utf8");
  const sha256 = crypto.createHash("sha256").update(htmlBuffer).digest("hex");
  const keySuffix = crypto.randomUUID();
  const r2Key = `org/${operatingCompanyId}/form-425c/${reportId}/${keySuffix}.html`;
  const monthLabel = labelForMonth(String(report.reporting_month ?? ""));
  const companyName = String(profile?.company_name ?? "IH 35");
  const suggestedFilename = `${companyName} – ${monthLabel} – Monthly Operating Report.pdf`;

  const fileInsert = await client.query<{ id: string }>(
    `
      INSERT INTO docs.files (
        operating_company_id,
        original_filename,
        mime_type,
        size_bytes,
        sha256_hash,
        r2_key,
        upload_completed_at,
        description,
        uploader_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, now(), $7, $8)
      RETURNING id
    `,
    [
      operatingCompanyId,
      `form-425c-${String(report.reporting_month ?? "").slice(0, 10)}.html`,
      "text/html",
      htmlBuffer.length,
      sha256,
      r2Key,
      "Generated Form 425C filing HTML snapshot",
      userId,
    ]
  );
  const fileId = fileInsert.rows[0]?.id ?? null;

  return {
    filingRecordId: reportId,
    fileId,
    sha256,
    r2Key,
    printHtml,
    suggestedFilename,
  };
}
