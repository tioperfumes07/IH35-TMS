// U25 (owner 2026-10-03): "Nothing on the books but it does affect the categorization. We can receive a credit for the
// reefer fuel from the US government so we need to have it detailed — how many gallons etc."
// Diesel burned by a trailer's reefer unit is a nontaxable (off-highway) use; its federal excise tax is claimed on IRS
// Form 4136 as gallons × the per-gallon rate, with the actual fuel cost. This page lists every reefer fill of a quarter
// with its gallons, cost, trailer, unit, load and document, totals the gallons and the credit, and lets the office record
// the gallons (and trailer) of a fill that came in without them — from its receipt.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ReportsSubNav } from "./ReportsSubNav";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityPicker } from "../../components/EntityPicker";
import { Button } from "../../components/Button";
import { SelectCombobox } from "../../components/Combobox";
import { formatUsdCents } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";
import { getReeferFuelCreditReport, recordReeferFuelGallons, setReeferFuelTrailer, type ReeferCreditRow } from "../../api/reports";

function quarterRange(year: number, quarter: number): { from: string; to: string } {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(year, endMonth, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { from: `${year}-${pad(startMonth)}-01`, to: `${year}-${pad(endMonth)}-${pad(lastDay)}` };
}

function currentQuarter(): { year: number; quarter: number } {
  const now = new Date();
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

function RecordGallons({ row, companyId }: { row: ReeferCreditRow; companyId: string }) {
  const queryClient = useQueryClient();
  const [gallons, setGallons] = useState("");
  const [trailerId, setTrailerId] = useState<string | null>(row.trailer_id);
  const save = useMutation({
    mutationFn: () => recordReeferFuelGallons(companyId, row.expense_line_id as string, { gallons: Number(gallons), trailer_id: trailerId }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["reports", "reefer-fuel-credit"] }),
  });
  const valid = Number(gallons) > 0 && Number(gallons) <= 2000;
  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="reefer-record-gallons">
      <input
        className="h-8 w-20 rounded-sm border border-gray-300 px-2 text-xs"
        inputMode="decimal"
        placeholder="Gallons"
        value={gallons}
        onChange={(e) => setGallons(e.target.value.replace(/[^\d.]/g, ""))}
        aria-label={`Gallons for ${row.document_number ?? "fill"}`}
        data-testid="reefer-gallons-input"
      />
      {!row.trailer_id ? (
        <EntityPicker
          kind="trailer"
          operatingCompanyId={companyId}
          value={trailerId}
          onChange={(next) => setTrailerId(next ?? null)}
          allowCreate={false}
          placeholder="Trailer"
          dataTestId="reefer-trailer-picker"
        />
      ) : null}
      <Button size="sm" variant="secondary" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Saving…" : "Record"}
      </Button>
      {save.isError ? <span className="text-xs text-red-600">{save.error instanceof Error ? save.error.message : "Not saved."}</span> : null}
    </div>
  );
}

// ROUND 391.2 — "trailer_id on every reefer row": pick the Reefer trailer a fill went into (only a Reefer is accepted).
function SetTrailer({ row, companyId }: { row: ReeferCreditRow; companyId: string }) {
  const queryClient = useQueryClient();
  const [trailerId, setTrailerId] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      setReeferFuelTrailer(companyId, {
        source: row.source === "fuel_card" ? "fuel_card" : "expense",
        source_id: row.source === "fuel_card" ? row.source_id : (row.expense_line_id as string),
        trailer_id: trailerId as string,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["reports", "reefer-fuel-credit"] }),
  });
  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="reefer-set-trailer">
      <EntityPicker kind="trailer" operatingCompanyId={companyId} value={trailerId} onChange={(next) => setTrailerId(next ?? null)} allowCreate={false} placeholder="Reefer trailer" dataTestId="reefer-set-trailer-picker" />
      <Button size="sm" variant="secondary" disabled={!trailerId || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Saving…" : "Set"}
      </Button>
      {save.isError ? <span className="text-xs text-red-600">{save.error instanceof Error ? save.error.message : "Not saved."}</span> : null}
    </div>
  );
}

export function ReeferFuelCreditReportPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [{ year, quarter }, setPeriod] = useState(currentQuarter);
  const { from, to } = quarterRange(year, quarter);

  const reportQuery = useQuery({
    queryKey: ["reports", "reefer-fuel-credit", companyId, from, to],
    queryFn: () => getReeferFuelCreditReport(companyId, from, to),
    enabled: Boolean(companyId),
    retry: false,
  });
  const rows = reportQuery.data?.rows ?? [];
  const totals = reportQuery.data?.totals;

  const columns = useMemo<ParityColumn<ReeferCreditRow>[]>(
    () => [
      { key: "date", label: "Date", sortable: true, render: (r) => formatDateUS(r.date) },
      {
        key: "document_number",
        label: "Document",
        sortable: true,
        render: (r) =>
          r.expense_id ? (
            <EntityLink kind="expense" id={r.expense_id} label={r.document_number ?? "Expense"} />
          ) : r.source === "relay_feed" ? (
            `Relay ${r.document_number ?? ""}`.trim()
          ) : (
            "Fuel card"
          ),
      },
      { key: "vendor_name", label: "Vendor", sortable: true, render: (r) => r.vendor_name ?? "—" },
      { key: "location", label: "Location", sortable: true, render: (r) => r.location ?? "—" },
      { key: "unit_number", label: "Unit", sortable: true, render: (r) => (r.unit_id ? <EntityLink kind="unit" id={r.unit_id} label={r.unit_number ?? "Unit"} /> : "—") },
      {
        key: "trailer_number",
        label: "Trailer",
        sortable: true,
        render: (r) =>
          r.trailer_id ? (
            <span>
              <EntityLink kind="trailer" id={r.trailer_id} label={r.trailer_number ?? "Trailer"} />
              {r.trailer_type && !/reefer/i.test(r.trailer_type) ? (
                <span className="ml-1 text-xs text-red-600" data-testid="reefer-trailer-not-reefer">
                  ({r.trailer_type} — not a reefer trailer)
                </span>
              ) : null}
            </span>
          ) : r.source !== "relay_feed" ? (
            <SetTrailer row={r} companyId={companyId} />
          ) : (
            "—"
          ),
      },
      { key: "load_number", label: "Load", sortable: true, render: (r) => (r.load_id ? <EntityLink kind="load" id={r.load_id} label={r.load_number ?? "Load"} /> : "—") },
      {
        key: "gallons",
        label: "Gallons",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.gallons ?? -1,
        render: (r) =>
          r.gallons != null && r.gallons > 0 ? (
            r.gallons.toLocaleString("en-US", { maximumFractionDigits: 3 })
          ) : r.expense_line_id ? (
            <RecordGallons row={r} companyId={companyId} />
          ) : (
            <span className="text-red-600">Missing</span>
          ),
      },
      {
        key: "price_per_gallon_cents",
        label: "$ / gal",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        render: (r) => (r.price_per_gallon_cents != null ? formatUsdCents(Math.round(r.price_per_gallon_cents)) : "—"),
      },
      { key: "cost_cents", label: "Cost", sortable: true, className: "text-right", cellClass: "text-right tabular-nums", render: (r) => formatUsdCents(r.cost_cents) },
    ],
    [companyId],
  );

  const years = [year - 1, year, year + 1].filter((y, i, a) => a.indexOf(y) === i);

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Reefer fuel credit"
        subtitle="Reefer diesel by quarter — gallons, cost and trailer for the federal fuel tax credit (IRS Form 4136, nontaxable use)."
        backHref="/reports"
        breadcrumb={["Reports", "Reefer fuel credit"]}
      />
      <ReportsSubNav />
      {!companyId ? <p className="text-xs text-red-600">Select operating company.</p> : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-gray-600">
          Year
          <SelectCombobox value={String(year)} onChange={(e) => setPeriod({ year: Number(e.target.value), quarter })} aria-label="Year" data-testid="reefer-year">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className="text-xs font-semibold text-gray-600">
          Quarter
          <SelectCombobox value={String(quarter)} onChange={(e) => setPeriod({ year, quarter: Number(e.target.value) })} aria-label="Quarter" data-testid="reefer-quarter">
            {[1, 2, 3, 4].map((q) => (
              <option key={q} value={q}>
                Q{q}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <span className="text-xs text-gray-500">
          {formatDateUS(from)} – {formatDateUS(to)}
        </span>
      </div>

      {/* Report parity: every data-bearing report prints (the Form 4136 claim is filed from this page). */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          data-testid="reefer-credit-print"
        >
          Print
        </button>
      </div>

      {totals ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="reefer-totals">
          {[
            ["Reefer fills", String(totals.fills)],
            ["Gallons", totals.gallons.toLocaleString("en-US", { maximumFractionDigits: 3 })],
            ["Fuel cost", formatUsdCents(totals.cost_cents)],
            [`Est. credit (${totals.credit_rate_cents_per_gallon}¢/gal)`, formatUsdCents(totals.estimated_credit_cents)],
            ["Missing gallons / trailer", `${totals.fills_missing_gallons} / ${totals.fills_missing_trailer}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-sm border border-gray-200 bg-white p-2">
              <div className="text-xs font-bold uppercase text-gray-600">{label}</div>
              <div className="text-xs font-semibold text-gray-900">{value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {totals && totals.fills_missing_gallons > 0 ? (
        <div className="rounded-sm border border-slate-200 bg-slate-100 p-3 text-xs text-slate-700" data-testid="reefer-missing-banner">
          {totals.fills_missing_gallons} reefer fill{totals.fills_missing_gallons > 1 ? "s have" : " has"} no gallons — the credit counts only gallons
          on record. Enter them from the receipt in the Gallons column.
        </div>
      ) : null}

      <ParityTable
        rows={rows}
        columns={columns}
        rowKey={(r) => `${r.source}-${r.source_id}`}
        loading={reportQuery.isPending}
        storageKey="reefer-fuel-credit-report"
        emptyText="No reefer fuel in this quarter."
        exportFilename={`reefer-fuel-credit-${year}-Q${quarter}.csv`}
      />
      <p className="text-xs text-gray-500">
        Estimate only: the per-gallon rate and the claim (Form 4136 with the income tax return, or Form 8849 Schedule 1 for a quarterly
        refund) are confirmed by the CPA. Truck diesel is IFTA road fuel; reefer diesel is excluded from IFTA.
      </p>

      {reportQuery.isError ? (
        <ListErrorState title="Couldn't load report" {...formatQueryErrorDetail(reportQuery.error)} onRetry={() => void reportQuery.refetch()} />
      ) : null}
    </div>
  );
}
