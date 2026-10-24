/**
 * ROUND 443.293-A — Statement tab = owner settlement document (5753 eight-section layout),
 * read-only. Finalize / payment / edits live on SettlementStatementWorkflowPage (?workflow=1).
 */
import { useMemo } from "react";
import type { CompanySettlementReport } from "../../../api/accounting";
import type { TourReadout } from "../../../api/tourReadout";
import { formatUsd } from "../../../lib/money";
import { SettlementKpiGrid } from "./SettlementKpiGrid";
import { SettlementLoadsSection } from "./SettlementLoadsSection";
import { CompanyWaterfallSection } from "./CompanyWaterfallSection";
import { CompanySettlementItemizedByLoad } from "./CompanySettlementItemizedByLoad";
import { EarningsSection } from "./EarningsSection";
import { DeadheadPaySection } from "./DeadheadPaySection";
import { FuelPurchasesSection } from "./FuelPurchasesSection";
import { ExtraPaySection } from "./ExtraPaySection";
import { ReimbursementsSection } from "./ReimbursementsSection";
import { DeductionsSection } from "./DeductionsSection";
import { SettlementHeader } from "./SettlementHeader";
import { toDeductionRows } from "../settlementDeductionRows";

type Props = {
  settlementId: string;
  companyId: string;
  settlement: Record<string, unknown>;
  settlementDisplayId: string | null;
  readout: TourReadout | undefined;
  companyReport: CompanySettlementReport | undefined;
  driverId: string | null;
};

export function SettlementStatementDocumentBody({
  settlementId,
  companyId,
  settlement,
  settlementDisplayId,
  readout,
  companyReport,
  driverId,
}: Props) {
  const lines = (settlement.lines as Array<Record<string, unknown>> | undefined) ?? [];
  const activeLines = useMemo(
    () => lines.filter((line) => !line.voided_at && line.is_active !== false),
    [lines]
  );

  const settlementLoadIds = useMemo(() => {
    const byId = new Map<string, string | null>();
    for (const line of lines) {
      const loadId = line.load_id;
      if (typeof loadId !== "string" || !loadId) continue;
      const num = line.load_number;
      const number = typeof num === "string" && num ? num : null;
      if (!byId.has(loadId) || (byId.get(loadId) === null && number !== null)) byId.set(loadId, number);
    }
    const bookends: Array<{ idKey: string; numKey: string }> = [
      { idKey: "first_load_id", numKey: "first_load_number" },
      { idKey: "last_load_id", numKey: "last_load_number" },
    ];
    for (const { idKey, numKey } of bookends) {
      const loadId = settlement[idKey];
      if (typeof loadId !== "string" || !loadId) continue;
      const num = settlement[numKey];
      const number = typeof num === "string" && num ? num : null;
      if (!byId.has(loadId) || (byId.get(loadId) === null && number !== null)) byId.set(loadId, number);
    }
    return Array.from(byId, ([id, number]) => ({ id, number }));
  }, [lines, settlement]);

  const earnings = useMemo(
    () =>
      activeLines
        .filter((line) => String(line.line_type) === "earnings")
        .map((line) => ({
          id: String(line.id),
          load_id: typeof line.load_id === "string" ? line.load_id : null,
          load_number: typeof line.load_number === "string" ? line.load_number : null,
          line_date: typeof line.line_date === "string" ? line.line_date : null,
          origin_city: typeof line.origin_city === "string" ? line.origin_city : null,
          origin_state: typeof line.origin_state === "string" ? line.origin_state : null,
          dest_city: typeof line.dest_city === "string" ? line.dest_city : null,
          dest_state: typeof line.dest_state === "string" ? line.dest_state : null,
          source_driver_bill_id:
            typeof line.source_driver_bill_id === "string" ? line.source_driver_bill_id : null,
          source_label:
            typeof line.source_driver_bill_number === "string" && line.source_driver_bill_number
              ? line.source_driver_bill_number
              : typeof line.source_table === "string" && line.source_table
                ? line.source_table.replace(/^driver_finance\./, "")
                : null,
          description: String(line.description ?? ""),
          miles: line.miles == null ? undefined : Number(line.miles),
          rate: line.rate_cents == null ? undefined : Number(line.rate_cents) / 100,
          rate_source: typeof line.rate_source === "string" ? line.rate_source : null,
          amount: Number(line.amount ?? 0),
        })),
    [activeLines]
  );

  const deadhead = useMemo(
    () =>
      activeLines
        .filter((line) => String(line.line_type) === "deadhead_pay")
        .map((line) => ({
          id: String(line.id),
          load_id: typeof line.load_id === "string" ? line.load_id : null,
          load_number: typeof line.load_number === "string" ? line.load_number : null,
          line_date: typeof line.line_date === "string" ? line.line_date : null,
          origin_city: typeof line.origin_city === "string" ? line.origin_city : null,
          origin_state: typeof line.origin_state === "string" ? line.origin_state : null,
          dest_city: typeof line.dest_city === "string" ? line.dest_city : null,
          dest_state: typeof line.dest_state === "string" ? line.dest_state : null,
          source_driver_bill_id:
            typeof line.source_driver_bill_id === "string" ? line.source_driver_bill_id : null,
          source_label:
            typeof line.source_driver_bill_number === "string" && line.source_driver_bill_number
              ? line.source_driver_bill_number
              : typeof line.source_table === "string" && line.source_table
                ? line.source_table.replace(/^driver_finance\./, "")
                : null,
          description: String(line.description ?? ""),
          miles: line.miles == null ? undefined : Number(line.miles),
          rate: line.rate_cents == null ? undefined : Number(line.rate_cents) / 100,
          rate_source: typeof line.rate_source === "string" ? line.rate_source : null,
          amount: Number(line.amount ?? 0),
        })),
    [activeLines]
  );

  const extra = useMemo(
    () =>
      activeLines
        .filter((line) => String(line.line_type) === "extra_pay")
        .map((line) => ({
          id: String(line.id),
          load_id: typeof line.load_id === "string" ? line.load_id : null,
          load_number: typeof line.load_number === "string" ? line.load_number : null,
          line_date: typeof line.line_date === "string" ? line.line_date : null,
          approval_status: typeof line.approval_status === "string" ? line.approval_status : null,
          code: String(line.code ?? "EXTRA"),
          description: String(line.description ?? ""),
          amount: Number(line.amount ?? 0),
        })),
    [activeLines]
  );

  const reimbursements = useMemo(
    () =>
      activeLines
        .filter((line) => String(line.line_type) === "reimbursement")
        .map((line) => ({
          id: String(line.id),
          load_id: typeof line.load_id === "string" ? line.load_id : null,
          load_number: typeof line.load_number === "string" ? line.load_number : null,
          line_date: typeof line.line_date === "string" ? line.line_date : null,
          description: String(line.description ?? ""),
          reimbursement_type: typeof line.reimbursement_type === "string" ? line.reimbursement_type : null,
          vendor_name: typeof line.vendor_name === "string" ? line.vendor_name : null,
          vendor_invoice_number:
            typeof line.vendor_invoice_number === "string" ? line.vendor_invoice_number : null,
          receipt_number: typeof line.receipt_number === "string" ? line.receipt_number : null,
          amount: Number(line.amount ?? 0),
        })),
    [activeLines]
  );

  const deductions = useMemo(() => toDeductionRows(activeLines), [activeLines]);

  let seqCounter = 0;
  const seqLabel = (): string => {
    seqCounter += 1;
    return settlementDisplayId ? `${settlementDisplayId}-${seqCounter}` : String(seqCounter);
  };
  const extraWithSeq = extra.map((row) => ({ ...row, seq_label: seqLabel() }));
  const reimbursementsWithSeq = reimbursements.map((row) => ({ ...row, seq_label: seqLabel() }));
  const deductionsWithSeq = deductions.map((row) => ({ ...row, seq_label: seqLabel() }));

  const summary = useMemo(() => {
    const earningsTotal = earnings.reduce((sum, row) => sum + row.amount, 0);
    const deadheadTotal = deadhead.reduce((sum, row) => sum + row.amount, 0);
    const extraTotal = extra.reduce((sum, row) => sum + row.amount, 0);
    const reimbTotal = reimbursements.reduce((sum, row) => sum + row.amount, 0);
    const deductionTotal = deductions.reduce((sum, row) => sum + row.this_period_amount, 0);
    return { earningsTotal, deadheadTotal, extraTotal, reimbTotal, deductionTotal };
  }, [deadhead, deductions, earnings, extra, reimbursements]);

  const kpi = useMemo(() => {
    const loadedMiles = earnings.reduce((s, r) => s + (r.miles ?? 0), 0);
    const deductionBreakdown = deductions
      .map((d) => `${d.description} ${formatUsd(d.this_period_amount)}`)
      .join(" · ");
    const netPayDollars =
      summary.earningsTotal +
      summary.deadheadTotal +
      summary.extraTotal +
      summary.reimbTotal -
      summary.deductionTotal;
    const netPayCents = Math.round(netPayDollars * 100);
    return { loadedMiles, deductionBreakdown, netPayCents };
  }, [deductions, earnings, summary]);

  return (
    <div
      className="space-y-3"
      data-testid="settlement-statement-document"
      data-surface="settlement-statement-document"
      data-settlement-statement-eight-section="1"
    >
      <SettlementHeader
        settlementId={settlementId}
        settlementDisplayId={settlementDisplayId}
        driverId={driverId}
        driverName={String(settlement.driver_full_name ?? "—")}
        periodStart={String(settlement.period_start ?? "—")}
        periodEnd={String(settlement.period_end ?? "—")}
        status={String(settlement.status ?? "—")}
        computedAt={null}
        loadIds={settlementLoadIds}
        predecessor={
          settlement.predecessor_settlement_id
            ? {
                id: String(settlement.predecessor_settlement_id),
                label: (settlement.predecessor_settlement_label as string | null) ?? null,
              }
            : null
        }
        successor={
          settlement.successor_settlement_id
            ? {
                id: String(settlement.successor_settlement_id),
                label: (settlement.successor_settlement_label as string | null) ?? null,
              }
            : null
        }
        onRefresh={() => undefined}
      />
      <SettlementKpiGrid
        revenueCents={
          companyReport
            ? companyReport.sections.revenue.invoiced_cents
            : (readout?.company_settlement?.revenue_cents ?? 0)
        }
        revenueSub={`${readout?.legs.length ?? 0} load${(readout?.legs.length ?? 0) === 1 ? "" : "s"}`}
        driverPayCents={
          readout?.driver_settlement?.gross_cents ??
          Math.round((summary.earningsTotal + summary.deadheadTotal) * 100)
        }
        driverPaySub={`${kpi.loadedMiles.toLocaleString("en-US", { maximumFractionDigits: 0 })} mi loaded`}
        reimbursementCents={Math.round(summary.reimbTotal * 100)}
        reimbursementLines={reimbursements.length}
        deductionCents={Math.round(summary.deductionTotal * 100)}
        deductionBreakdown={kpi.deductionBreakdown}
        netPayCents={kpi.netPayCents}
        companyMarginCents={
          companyReport
            ? companyReport.sections.pl_rollup.net_revenue_cents
            : (readout?.company_settlement?.margin_cents ?? 0)
        }
        companyMarginSub={
          companyReport
            ? companyReport.sections.revenue.invoiced_cents
              ? `${((companyReport.sections.pl_rollup.net_revenue_cents / companyReport.sections.revenue.invoiced_cents) * 100).toFixed(1)}%`
              : "—"
            : readout?.totals?.margin_pct == null
              ? "—"
              : `${readout.totals.margin_pct.toFixed(1)}%`
        }
      />
      {readout ? <SettlementLoadsSection legs={readout.legs} operatingCompanyId={companyId} /> : null}
      {readout ? <CompanyWaterfallSection readout={readout} report={companyReport} /> : null}
      {companyReport ? <CompanySettlementItemizedByLoad report={companyReport} /> : null}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-2">
          <EarningsSection lines={earnings} isOpen={false} operatingCompanyId={companyId} />
          <DeadheadPaySection lines={deadhead} isOpen={false} operatingCompanyId={companyId} />
          <FuelPurchasesSection rows={companyReport?.sections.fuel_purchases.rows ?? []} />
          <ExtraPaySection lines={extraWithSeq} isOpen={false} operatingCompanyId={companyId} />
          <ReimbursementsSection lines={reimbursementsWithSeq} isOpen={false} operatingCompanyId={companyId} />
          <DeductionsSection
            rows={deductionsWithSeq}
            onHold={() => {}}
            onResume={() => {}}
            isOpen={false}
            operatingCompanyId={companyId}
          />
        </div>
      </div>
    </div>
  );
}
