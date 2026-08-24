import crypto from "node:crypto";
import { isR2Configured, putObjectBytes } from "../storage/r2-client.js";

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

// Placeholder values the frontend used to silently substitute when the entity profile had no real
// bankruptcy case number set (Form425CHome.tsx previously defaulted to "25-00000" on report creation).
// A court filing generated or marked filed with one of these is not a validation gap to warn about
// later — it is a fabricated case number on a real Chapter 11 filing. Refuse outright.
const PLACEHOLDER_CASE_NUMBERS = new Set(["25-00000"]);

export function isInvalidCaseNumber(caseNumber: unknown): boolean {
  const trimmed = String(caseNumber ?? "").trim();
  return trimmed.length === 0 || PLACEHOLDER_CASE_NUMBERS.has(trimmed);
}

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

type ExhibitRow = { line_number?: unknown; explanation?: unknown };

function exhibitSection(title: string, flagged: number[], rows: ExhibitRow[]) {
  if (!flagged.length && !rows.length) return "";
  const items = flagged.map((line) => {
    const texts = rows.filter((r) => Number(r.line_number) === line).map((r) => String(r.explanation ?? "").trim()).filter(Boolean);
    if (texts.length) {
      return texts.map((t) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #dde4ee;"><strong>Line ${line}.</strong> ${t}</td></tr>`).join("");
    }
    return `<tr><td style="padding:4px 8px;border-bottom:1px solid #dde4ee;color:#c00;"><strong>Line ${line}.</strong> No Exhibit explanation saved</td></tr>`;
  });
  return `<div class="section">${title}</div><table style="border:1px solid #cbd5e1">${items.join("")}</table>`;
}

function requireCourtPrintAnswers(report: Record<string, unknown>) {
  const part1 = (report.part1_answers as Record<string, string>) ?? {};
  const part2 = (report.part2_answers as Record<string, string>) ?? {};
  const answers = { ...part1, ...part2 };
  for (let n = 1; n <= 18; n += 1) {
    const ans = String(answers[String(n)] ?? "").trim().toLowerCase();
    if (ans !== "yes" && ans !== "no" && ans !== "na") {
      throw new Error("form_425c_answers_incomplete");
    }
  }
  return answers;
}

function buildPrintHTML(
  report: Record<string, unknown>,
  profile: Record<string, unknown> | undefined,
  exhibitA: ExhibitRow[] = [],
  exhibitB: ExhibitRow[] = [],
) {
  const companyName = String(profile?.company_name ?? "").trim();
  if (!companyName) throw new Error("form_425c_profile_required");
  const answers = requireCourtPrintAnswers(report);
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
    const ans = String(answers[String(num)] ?? "").trim().toLowerCase();
    const flagged = (expectYes && ans === "no") || (!expectYes && ans === "yes");
    return `<tr style="${flagged ? "background:#fff8f8;" : ""}"><td style="padding:4px 8px;border-bottom:1px solid #dde4ee;">${num}. ${text}${flagged ? " <em style='color:#c00'>[Exhibit required]</em>" : ""}</td><td style="padding:4px 8px;border-left:1px solid #dde4ee;border-bottom:1px solid #dde4ee;text-align:center;">${ans.toUpperCase()}</td></tr>`;
  };

  return `<!doctype html><html><head><meta charset="utf-8" /><style>@page{size:letter;margin:.5in}.section{background:#1e3a6a;color:#fff;padding:4px 8px;margin-top:8px;font-weight:700}table{width:100%;border-collapse:collapse}body{font-family:Arial,sans-serif;font-size:12px}</style></head><body>
  <h2 style="margin:0">Official Form 425C — Monthly Operating Report</h2>
  <div style="margin:4px 0 10px;color:#334155;">${companyName} · ${labelForMonth(String(report.reporting_month ?? ""))}</div>

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
  ${exhibitSection(
    "Exhibit A — lines 1–9",
    QUESTIONNAIRE.filter(([n, , ey]) => {
      const ans = String(answers[String(n)] ?? "").trim().toLowerCase();
      return n <= 9 && ((ey && ans === "no") || (!ey && ans === "yes"));
    }).map(([n]) => n),
    exhibitA,
  )}
  ${exhibitSection(
    "Exhibit B — lines 10–18",
    QUESTIONNAIRE.filter(([n, , ey]) => {
      const ans = String(answers[String(n)] ?? "").trim().toLowerCase();
      return n >= 10 && ((ey && ans === "no") || (!ey && ans === "yes"));
    }).map(([n]) => n),
    exhibitB,
  )}
</body></html>`;
}

/** Read-only court HTML. Does not INSERT docs.files or mutate the MOR (filed reprint). */
export async function buildForm425CPrintDocument({
  client,
  reportId,
  operatingCompanyId,
}: Omit<GenerateForm425CPdfInput, "userId">) {
  const reportRes = await client.query(
    `
      SELECT *
      FROM compliance.form_425c_reports
      WHERE id = $1
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [reportId, operatingCompanyId]
  );
  const report = reportRes.rows[0];
  if (!report) throw new Error("form_425c_report_not_found");
  if (isInvalidCaseNumber(report.case_number)) {
    throw new Error("form_425c_case_number_required");
  }

  const profileRes = await client.query(
    `
      SELECT *
      FROM catalogs.form_425c_company_profiles p
      JOIN org.companies c ON c.id = p.operating_company_id
      WHERE p.operating_company_id = $1::uuid
        AND p.company_key = CASE WHEN c.code = 'TRK' THEN 'trucking' ELSE 'transportation' END
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  const profile = profileRes.rows[0];
  if (!profile) throw new Error("form_425c_profile_required");

  const exhibitARes = await client.query<ExhibitRow>(
    `
      SELECT line_number, explanation
      FROM compliance.form_425c_exhibit_a_entries
      WHERE report_id = $1
      ORDER BY line_number, created_at
    `,
    [reportId]
  );
  const exhibitBRes = await client.query<ExhibitRow>(
    `
      SELECT line_number, explanation
      FROM compliance.form_425c_exhibit_b_entries
      WHERE report_id = $1
      ORDER BY line_number, created_at
    `,
    [reportId]
  );

  const printHtml = buildPrintHTML(report, profile, exhibitARes.rows, exhibitBRes.rows);
  const monthLabel = labelForMonth(String(report.reporting_month ?? ""));
  const companyName = String(profile.company_name ?? "").trim();
  if (!companyName) throw new Error("form_425c_profile_required");
  const suggestedFilename = `${companyName} – ${monthLabel} – Monthly Operating Report.pdf`;
  return { report, printHtml, suggestedFilename };
}

export async function generateForm425CPdf({ client, userId, reportId, operatingCompanyId }: GenerateForm425CPdfInput) {
  const built = await buildForm425CPrintDocument({ client, reportId, operatingCompanyId });
  const htmlBuffer = Buffer.from(built.printHtml, "utf8");
  const sha256 = crypto.createHash("sha256").update(htmlBuffer).digest("hex");
  const keySuffix = crypto.randomUUID();
  const r2Key = `org/${operatingCompanyId}/form-425c/${reportId}/${keySuffix}.html`;
  if (!isR2Configured()) {
    throw new Error("form_425c_r2_not_configured");
  }
  try {
    await putObjectBytes(r2Key, htmlBuffer, "text/html");
  } catch {
    throw new Error("form_425c_r2_put_failed");
  }
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
      `form-425c-${String(built.report.reporting_month ?? "").slice(0, 10)}.html`,
      "text/html",
      htmlBuffer.length,
      sha256,
      r2Key,
      "Generated Form 425C filing HTML snapshot",
      userId,
    ]
  );
  const fileId = fileInsert.rows[0]?.id;
  if (!fileId) {
    throw new Error("form_425c_filing_file_insert_failed");
  }

  return {
    filingRecordId: reportId,
    fileId,
    sha256,
    r2Key,
    printHtml: built.printHtml,
    suggestedFilename: built.suggestedFilename,
  };
}
