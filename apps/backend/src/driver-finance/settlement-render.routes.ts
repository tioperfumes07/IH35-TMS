import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { formatDateTime, formatMoney, joinBrandAddrLines, wrapPdfDocument } from "../render/pdf-template.js";
import { formatSettlementPeriodLines, renderSettlementBody, type SettlementDeductionRow, type SettlementHtmlModel, type SettlementLoadRow } from "../render/settlement.template.js";
import { driverBillRowsToSettlementLoads, listDriverBillsForSettlementPeriod, type DriverBillSettlementRow } from "./settlements.service.js";

const paramsSchema = z.object({ settlementId: z.string().uuid() });

function canViewSettlementHtml(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

async function hasSettlementSchema(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ ok?: boolean }> }> }) {
  const res = await client.query(`SELECT to_regclass('driver_finance.driver_settlements') IS NOT NULL AS ok`);
  return Boolean(res.rows[0]?.ok);
}

async function hasDriverBillsTable(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ ok?: boolean }> }> }) {
  const res = await client.query(`SELECT to_regclass('driver_finance.driver_bills') IS NOT NULL AS ok`);
  return Boolean(res.rows[0]?.ok);
}

function dollarsToCents(value: unknown): number {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

async function enqueueSettlementHtmlOutbox(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }, payload: Record<string, unknown>) {
  await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
    "driver_finance.settlement.html_requested",
    JSON.stringify(payload),
  ]);
}

export async function registerDriverFinanceSettlementHtmlRoutes(app: FastifyInstance) {
  app.get("/api/v1/driver-finance/settlements/:settlementId.html", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await hasSettlementSchema(client))) return { kind: "unavailable" as const };

      const settlementRes = await client.query(
        `
          SELECT
            s.*,
            concat_ws(' ', d.first_name, d.last_name) AS driver_full_name,
            d.cdl_state,
            d.cdl_expiration_date,
            d.identity_user_id,
            d.display_id AS driver_display_id
          FROM driver_finance.driver_settlements s
          JOIN mdata.drivers d ON d.id = s.driver_id
          WHERE s.id = $1
            AND s.operating_company_id = $2
          LIMIT 1
        `,
        [params.data.settlementId, query.data.operating_company_id]
      );
      const settlement = settlementRes.rows[0] ?? null;
      if (!settlement) return { kind: "not_found" as const };

      const allowedOffice = canViewSettlementHtml(String(user.role ?? ""));
      const allowedDriver = String(settlement.identity_user_id ?? "") === user.uuid;
      if (!allowedOffice && !allowedDriver) return { kind: "forbidden" as const };

      const linesRes = await client.query(
        `SELECT * FROM driver_finance.settlement_lines WHERE settlement_id = $1 ORDER BY created_at ASC`,
        [params.data.settlementId]
      );

      const ytdRes = await client.query(
        `
          SELECT
            COALESCE(SUM(gross_pay), 0)::numeric AS gross,
            COALESCE(SUM(deductions_total), 0)::numeric AS deductions,
            COALESCE(SUM(net_pay), 0)::numeric AS net
          FROM driver_finance.driver_settlements
          WHERE operating_company_id = $1
            AND driver_id = $2
            AND period_start >= date_trunc('year', $3::date)
            AND period_end <= $3::date
        `,
        [query.data.operating_company_id, settlement.driver_id, settlement.period_end]
      );
      const ytdRow = ytdRes.rows[0] ?? {};

      const companyRes = await client.query(
        `SELECT legal_name, short_name, tax_id, phone, email, address_line1, city, state, postal_code FROM org.companies WHERE id = $1 LIMIT 1`,
        [query.data.operating_company_id]
      );
      const company = companyRes.rows[0] ?? {};

      const deductions: SettlementDeductionRow[] = [];
      const lineDerivedLoads: SettlementLoadRow[] = [];

      for (const line of linesRes.rows as Array<Record<string, unknown>>) {
        const lineType = String(line.line_type ?? "");
        const description = String(line.description ?? "");
        const cents = dollarsToCents(line.amount);
        if (lineType === "deduction") {
          deductions.push({ item: description || "Deduction", reference: description || "—", amountCents: -Math.abs(cents) });
          continue;
        }

        const loadMatch = description.match(/L-[A-Z0-9-]+/i);
        lineDerivedLoads.push({
          loadNum: loadMatch?.[0]?.toUpperCase() ?? "—",
          lane: description,
          shortMi: "—",
          ratePerMi: "—",
          linehaulCents: Math.max(cents, 0),
          bonusesDisplay: lineType === "extra_pay" ? formatMoney(Math.max(cents, 0)) : "—",
          lineTotalCents: Math.max(cents, 0),
        });
      }

      let billRowsCache: Awaited<ReturnType<typeof listDriverBillsForSettlementPeriod>> | null = null;
      if (await hasDriverBillsTable(client)) {
        try {
          billRowsCache = await listDriverBillsForSettlementPeriod(client, {
            operatingCompanyId: query.data.operating_company_id,
            driverId: String(settlement.driver_id),
            periodStart: String(settlement.period_start),
            periodEnd: String(settlement.period_end),
          });
        } catch {
          billRowsCache = null;
        }
      }

      let loadRows: SettlementLoadRow[] =
        billRowsCache && billRowsCache.length > 0 ? driverBillRowsToSettlementLoads(billRowsCache) : lineDerivedLoads;

      if (loadRows.length === 0) {
        loadRows.push({
          loadNum: "—",
          lane: "Period earnings (detail pending line items)",
          shortMi: "—",
          ratePerMi: "—",
          linehaulCents: dollarsToCents(settlement.gross_pay),
          bonusesDisplay: "—",
          lineTotalCents: dollarsToCents(settlement.gross_pay),
        });
      }

      const billMilesTotal =
        billRowsCache?.reduce((sum: number, row: DriverBillSettlementRow) => sum + Number(row.miles_basis ?? 0), 0) ?? 0;

      const grossCents = dollarsToCents(settlement.gross_pay);
      const reimbCents = dollarsToCents(settlement.reimbursements_total);
      const deductionsTotalCents = dollarsToCents(settlement.deductions_total);
      const netCents = dollarsToCents(settlement.net_pay);

      const loadsFoot = {
        label: "Gross loads + bonuses",
        shortMi: "—",
        rate: "—",
        linehaulCents: grossCents,
        bonusesDisplay: reimbCents !== 0 ? formatMoney(reimbCents) : "—",
        lineTotalCents: grossCents + reimbCents,
      };

      const brandName = String(company.legal_name ?? company.short_name ?? "Carrier");
      const brandSub = company.tax_id ? `EIN ${String(company.tax_id)}` : "Motor carrier";
      const brandAddrLines = [
        [company.address_line1, company.city, company.state, company.postal_code].filter(Boolean).join(", "),
        [company.phone ? String(company.phone) : null, company.email ? String(company.email) : null].filter(Boolean).join(" · "),
      ];

      const settlementDocNum = String(settlement.display_id ?? params.data.settlementId);
      const driverName = String(settlement.driver_full_name ?? "Driver");
      const cdlState = settlement.cdl_state ? String(settlement.cdl_state) : "—";
      const cdlExp = settlement.cdl_expiration_date ? String(settlement.cdl_expiration_date) : "—";

      const model: SettlementHtmlModel = {
        brandName,
        brandSub,
        brandAddrHtml: joinBrandAddrLines(brandAddrLines),
        settlementDocNum,
        periodLines: formatSettlementPeriodLines(String(settlement.period_start), String(settlement.period_end), settlement.paid_at ?? null, "ACH"),
        statusLine: `Settlement · ${String(settlement.status ?? "draft")}`,
        driverBlock: [
          { label: "Driver", value: driverName, sub: `${settlement.driver_display_id ? String(settlement.driver_display_id) : "DRV"} · 1099 contractor` },
          { label: "CDL", value: `${cdlState} · exp ${cdlExp}`, sub: "Medical card on file" },
          { label: "Pay type", value: "Per settlement lines", sub: "Rates shown per load entries below" },
          { label: "Tax form", value: "1099-NEC YTD", sub: "Totals include settlements through this period" },
        ],
        loadsSummaryRight: `${loadRows.length} loads · settlement gross ${formatMoney(grossCents)}`,
        loadRows,
        loadsFoot,
        deductionsRight: "Advance recoveries · escrow · other deductions",
        deductions,
        deductionsTotalCents,
        netTitle: "Net settlement · paid per schedule",
        netSubLines: ["ACH posting notifications emailed when payment is released"],
        netCents,
        ytd: {
          grossCents: dollarsToCents(ytdRow.gross),
          deductionsCents: dollarsToCents(ytdRow.deductions),
          netCents: dollarsToCents(ytdRow.net),
          milesDisplay: billMilesTotal > 0 ? String(billMilesTotal) : "—",
        },
        sigDriverName: driverName,
        dispatcherSigLine: `${brandName} payroll`,
        dispatcherIssuedNote: `Generated ${formatDateTime(new Date())}`,
        disputesFooter: `Email ${String(company.email ?? "payroll@carrier.local")} with settlement # and disputed line.`,
        escrowFooter: "Escrow balances follow your contractor agreement; released per policy after separation.",
      };

      await appendCrudAudit(
        client,
        user.uuid,
        "driver_finance.settlement.html_viewed",
        {
          operating_company_id: query.data.operating_company_id,
          settlement_id: params.data.settlementId,
          settlement_display_id: settlement.display_id ?? null,
        },
        "info",
        "P6-T11171-PDF-RENDER"
      );

      await enqueueSettlementHtmlOutbox(client, {
        operating_company_id: query.data.operating_company_id,
        settlement_id: params.data.settlementId,
        settlement_display_id: settlement.display_id ?? null,
        requested_by_user_id: user.uuid,
      });

      const body = renderSettlementBody(model);
      return { kind: "ok" as const, body, title: `${settlementDocNum} · Settlement statement` };
    });

    if (!payload) return reply.code(500).send({ error: "settlement_html_failed" });
    if (payload.kind === "unavailable") return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    if (payload.kind === "not_found") return reply.code(404).send({ error: "settlement_not_found" });
    if (payload.kind === "forbidden") return reply.code(403).send({ error: "forbidden" });

    reply.header("Content-Type", "text/html; charset=utf-8");
    reply.header("Cache-Control", "private, no-store");
    return reply.send(wrapPdfDocument({ title: payload.title, body: payload.body }));
  });
}
