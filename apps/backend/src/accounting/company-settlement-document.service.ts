import { appendCrudAudit } from "../audit/crud-audit.js";
import { formatDate, joinBrandAddrLines } from "../render/pdf-template.js";
import { renderCompanySettlementBody, type CompanySettlementHtmlModel } from "../render/company-settlement.template.js";
import { buildCompanySettlementReport } from "./company-settlement-report.service.js";

/**
 * ONE COMPANY SETTLEMENT DOCUMENT (Lead, 2026-09-30).
 *
 * Owner: "we need to get done also the company settlements pdfs not just driver."
 *
 * He was right that it was missing, and it was missing ENTIRELY -- company settlements had exactly
 * one render route, `:id.html`, and NO pdf endpoint at any spelling. The driver settlement has a
 * real `/pdf` that renders through puppeteer; the company settlement had nothing, so "print the
 * company settlement" meant opening a browser and using Cmd-P.
 *
 * This module is now the ONLY place a company settlement document is built. The HTML route and the
 * new PDF route both call it, exactly as buildDriverSettlementDocument serves both driver surfaces,
 * so the two can never drift into different papers the way the driver pair had.
 */
export type CompanySettlementDocumentInput = {
  companySettlementId: string;
  operatingCompanyId: string;
  userId: string;
};

export type CompanySettlementDocumentResult =
  | { kind: "not_found" }
  | { kind: "ok"; body: string; title: string; displayId: string };

export async function buildCompanySettlementDocument(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> },
  input: CompanySettlementDocumentInput
): Promise<CompanySettlementDocumentResult> {
  const operatingCompanyId = input.operatingCompanyId;
        const report = await buildCompanySettlementReport(client, {
          companySettlementId: input.companySettlementId,
          operatingCompanyId,
        });
        if (!report) return { kind: "not_found" as const };

        const companyRes = await client.query(
          `SELECT legal_name, short_name, tax_id, phone, email, address_line1, city, state, postal_code FROM org.companies WHERE id = $1 LIMIT 1`,
          [operatingCompanyId]
        );
        const company = (companyRes.rows[0] ?? {}) as Record<string, unknown>;
        const brandName = String(company.legal_name ?? company.short_name ?? "Carrier");
        const brandSub = company.tax_id ? `EIN ${String(company.tax_id)}` : "Motor carrier";
        const brandAddrLines = [
          [company.address_line1, company.city, company.state, company.postal_code].filter(Boolean).join(", "),
          [company.phone ? String(company.phone) : null, company.email ? String(company.email) : null].filter(Boolean).join(" · "),
        ];

        const model: CompanySettlementHtmlModel = {
          brandName,
          brandSub,
          brandAddrHtml: joinBrandAddrLines(brandAddrLines),
          report,
          periodLines: [`Period ${formatDate(report.period_start)} — ${formatDate(report.period_end)}`],
          statusLine: `Status · ${report.status}`,
          driverCountLabel: `${report.driver_settlement_ids.length} driver settlement(s)`,
        };

        await appendCrudAudit(
          client,
          input.userId,
          "accounting.company_settlement.html_viewed",
          {
            operating_company_id: operatingCompanyId,
            company_settlement_id: input.companySettlementId,
            company_settlement_display_id: report.display_id,
          },
          "info",
          "SET-30-PDF-RENDER"
        );

        const body = renderCompanySettlementBody(model);
        return {
          kind: "ok" as const,
          body,
          title: `${report.display_id} · Company settlement`,
          displayId: String(report.display_id),
        };
}
