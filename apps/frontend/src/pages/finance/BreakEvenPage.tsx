import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { DatePicker } from "../../components/forms/DatePicker";
import { PageHeader } from "../../components/layout/PageHeader";
import { DrillKpiCard } from "../../components/layout/DrillKpiCard";
import { FinanceModuleTabs } from "./FinanceModuleTabs";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { formatUsdCents } from "../../lib/money";
import {
  FINANCE_BREAK_EVEN_UI_FLAG,
  getBreakEvenInputs,
  computeBreakEven,
  type BreakEvenClassification,
} from "../../api/financeBreakEven";

// F1 — Break-Even Analysis.
// READ-ONLY analytics/estimate. A single GET pulls the cost-per-mile inputs (revenue, miles, per-account
// GL expense lines) from existing read surfaces; the break-even model is computed in-browser so the owner
// can reclassify each expense line fixed/variable, edit miles, and pick the revenue basis as a non-persisted
// what-if. Nothing here posts, writes, or moves money. Gated behind FINANCE_BREAK_EVEN_UI_ENABLED (OFF).

const fmtCents = (c: number) => formatUsdCents(c);
const fmtInt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n || 0));
// Per-mile figures are cents/mile → dollars/mile with 3 decimals (industry convention, e.g. $1.583/mi).
const fmtPerMile = (centsPerMile: number | null) =>
  centsPerMile == null ? "—" : `$${(centsPerMile / 100).toFixed(3)}/mi`;
const fmtPerDay = (centsPerDay: number | null) =>
  centsPerDay == null ? "—" : `${fmtCents(centsPerDay)}/day`;

function startOfYearIso(): string {
  return `${new Date().getUTCFullYear()}-01-01`;
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type Tone = "neutral" | "good" | "bad";

// C8: `to` is REQUIRED — every modelled figure opens the records it was computed from (the GL
// expense lines, the recognised revenue, or the loads that supplied the miles). The model itself is
// an in-browser what-if, but its INPUTS are all real records with a screen of their own.
function StatTile({
  label,
  value,
  secondary,
  tone = "neutral",
  to,
}: {
  label: string;
  value: string;
  secondary?: string;
  tone?: Tone;
  to: string;
}) {
  return (
    <DrillKpiCard size="md" label={label} value={value} hint={secondary} valueTone={tone === "bad" ? "critical" : "default"} to={to} />
  );
}

export function BreakEvenPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag(FINANCE_BREAK_EVEN_UI_FLAG, companyId);

  const [fromDate, setFromDate] = useState(startOfYearIso());
  const [toDate, setToDate] = useState(todayIso());
  const [appliedRange, setAppliedRange] = useState({ from: startOfYearIso(), to: todayIso() });
  // Non-persisted what-if overrides.
  const [classOverrides, setClassOverrides] = useState<Record<string, BreakEvenClassification>>({});
  const [milesOverride, setMilesOverride] = useState<string>(""); // blank = use live miles
  const [revenueBasis, setRevenueBasis] = useState<"gl" | "loads">("gl");

  const active = enabled && Boolean(companyId);

  const inputsQuery = useQuery({
    queryKey: ["f1-break-even", companyId, appliedRange.from, appliedRange.to],
    queryFn: () =>
      getBreakEvenInputs({
        operating_company_id: companyId,
        from_date: appliedRange.from,
        to_date: appliedRange.to,
      }),
    enabled: active,
    retry: false,
  });

  const data = inputsQuery.data;

  const model = useMemo(() => {
    if (!data) return null;
    const classify = (code: string, dflt: BreakEvenClassification) => classOverrides[code] ?? dflt;
    let fixed = 0;
    let variable = 0;
    for (const line of data.expense_lines) {
      if (classify(line.account_code, line.default_classification) === "variable") variable += line.amount_cents;
      else fixed += line.amount_cents;
    }
    const liveMiles = data.miles.total_miles;
    const miles = milesOverride.trim() === "" ? liveMiles : Math.max(0, Number(milesOverride) || 0);
    const revenue = revenueBasis === "gl" ? data.revenue.gl_revenue_cents : data.revenue.loads_gross_revenue_cents;
    return computeBreakEven({
      miles,
      days: data.days_in_period,
      revenue_cents: revenue,
      fixed_cost_cents: fixed,
      variable_cost_cents: variable,
    });
  }, [data, classOverrides, milesOverride, revenueBasis]);

  const header = (
    <PageHeader
      backHref="/finance/overview"
      title="Break-Even Analysis"
      subtitle="Finance · Break-Even — read-only estimate, nothing is posted"
    />
  );

  if (flagLoading) {
    return (
      <div className="p-6">
        <FinanceModuleTabs />
        {header}
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="p-6">
        <FinanceModuleTabs />
        {header}
        <div className="rounded-sm border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Break-Even Analysis is not yet enabled for this company. (Feature flag <code>{FINANCE_BREAK_EVEN_UI_FLAG}</code> is off.)
        </div>
      </div>
    );
  }

  const toggleClass = (code: string, current: BreakEvenClassification) => {
    setClassOverrides((prev) => ({ ...prev, [code]: current === "variable" ? "fixed" : "variable" }));
  };

  const effectiveClass = (code: string, dflt: BreakEvenClassification): BreakEvenClassification =>
    classOverrides[code] ?? dflt;

  const beRateTone: Tone = model?.profit_per_mile_cents == null ? "neutral" : model.profit_per_mile_cents >= 0 ? "good" : "bad";

  return (
    <div className="p-6">
      <FinanceModuleTabs />
      {header}

      {!companyId ? <p className="mb-3 text-sm text-red-600">Select an operating company.</p> : null}

      {/* Controls — single section frame; filter row uses border-b only (no nested card). */}
      <section
        className="mb-4 overflow-hidden rounded-sm border border-slate-200 bg-white"
        data-testid="break-even-controls"
      >
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50 p-3">
          <label className="flex flex-col text-xs font-medium text-slate-600">
            From
            <DatePicker
              value={fromDate}
              max={toDate}
              onChange={setFromDate}
              className="mt-1"
            />
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-600">
            To
            <DatePicker
              value={toDate}
              min={fromDate}
              max={todayIso()}
              onChange={setToDate}
              className="mt-1"
            />
          </label>
          <Button size="sm" onClick={() => setAppliedRange({ from: fromDate, to: toDate })}>
            Apply
          </Button>
          <label className="flex flex-col text-xs font-medium text-slate-600">
            Revenue basis
            <select
              value={revenueBasis}
              onChange={(e) => setRevenueBasis(e.target.value as "gl" | "loads")}
              className="mt-1 rounded-sm border border-slate-300 px-2 py-1 text-sm text-slate-900"
            >
              <option value="gl">GL recognized revenue</option>
              <option value="loads">Loads gross rate</option>
            </select>
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-600">
            Miles (override)
            <input
              type="number"
              min={0}
              placeholder={data ? fmtInt(data.miles.total_miles) : "live"}
              value={milesOverride}
              onChange={(e) => setMilesOverride(e.target.value)}
              className="mt-1 w-32 rounded-sm border border-slate-300 px-2 py-1 text-sm text-slate-900"
            />
          </label>
        </div>
      </section>

      {inputsQuery.isLoading ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {inputsQuery.isError ? <p className="text-sm text-red-600">Could not load break-even inputs.</p> : null}

      {data && model ? (
        <>
          {model.miles <= 0 ? (
            <p className="mb-4 border-l-4 border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              No miles recorded for this period ({data.miles.load_count} load{data.miles.load_count === 1 ? "" : "s"}). Per-mile
              figures require miles — enter a miles estimate above to model the break-even rate.
            </p>
          ) : null}

          {/* Headline break-even KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Break-even rate / mile" to="/accounting/expenses/list"
              value={fmtPerMile(model.total_cost_per_mile_cents)}
              secondary="Total operating cost ÷ miles"
            />
            <StatTile
              label="Revenue / mile"
              to={revenueBasis === "gl" ? "/finance/statements" : "/dispatch/loads"}
              value={fmtPerMile(model.revenue_per_mile_cents)}
              secondary={revenueBasis === "gl" ? "GL recognized revenue" : "Loads gross rate"}
            />
            <StatTile
              label="Profit / mile" to="/finance/statements"
              value={fmtPerMile(model.profit_per_mile_cents)}
              secondary="Revenue/mi − break-even/mi"
              tone={beRateTone}
            />
            <StatTile
              label="Break-even miles" to="/dispatch/loads"
              value={model.break_even_miles == null ? "—" : fmtInt(model.break_even_miles)}
              secondary="Miles to cover fixed cost at current margin"
            />
          </div>

          {/* Cost structure */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Fixed cost / day" to="/accounting/expenses/list" value={fmtPerDay(model.fixed_cost_per_day_cents)} secondary={`${fmtCents(model.fixed_cost_cents)} over ${model.days} day${model.days === 1 ? "" : "s"}`} />
            <StatTile label="Variable cost / mile" to="/accounting/expenses/list" value={fmtPerMile(model.variable_cost_per_mile_cents)} secondary={fmtCents(model.variable_cost_cents)} />
            <StatTile label="Contribution margin / mile" to="/finance/statements" value={fmtPerMile(model.contribution_margin_per_mile_cents)} secondary="Revenue/mi − variable/mi" />
            <StatTile label="Net profit (period)" to="/finance/statements" value={fmtCents(model.net_profit_cents)} secondary={`${fmtCents(model.revenue_cents)} rev − ${fmtCents(model.total_cost_cents)} cost`} tone={model.net_profit_cents >= 0 ? "good" : "bad"} />
          </div>

          {/* Expense classification — single section frame; live-inputs strip + table (no nested cards). */}
          <section
            className="mt-4 overflow-hidden rounded-sm border border-slate-200 bg-white"
            data-testid="break-even-expense-frame"
          >
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Live inputs:</span>{" "}
              {fmtInt(data.miles.total_miles)} miles ({fmtInt(data.miles.loaded_miles)} loaded + {fmtInt(data.miles.deadhead_miles)} deadhead) across {fmtInt(data.miles.load_count)} loads ·
              GL revenue {fmtCents(data.revenue.gl_revenue_cents)} · loads gross {fmtCents(data.revenue.loads_gross_revenue_cents)}
            </div>

            <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Classification</th>
                </tr>
              </thead>
              <tbody>
                {data.expense_lines.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                      No expense postings in this period.
                    </td>
                  </tr>
                ) : (
                  data.expense_lines.map((line) => {
                    const cls = effectiveClass(line.account_code, line.default_classification);
                    return (
                      <tr key={line.account_code || line.account_name} className="border-b border-slate-100">
                        <td className="px-3 py-2 tabular-nums text-slate-500">{line.account_code || "—"}</td>
                        <td className="px-3 py-2 text-slate-900">{line.account_name || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-900">{fmtCents(line.amount_cents)}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => toggleClass(line.account_code, cls)}
                            className={[
                              "rounded-sm border px-2 py-0.5 text-xs font-medium",
                              cls === "variable"
                                ? "border-slate-400 bg-slate-100 text-slate-700"
                                : "border-slate-300 bg-white text-slate-600",
                            ].join(" ")}
                            title="Toggle fixed / variable (what-if, not saved)"
                          >
                            {cls === "variable" ? "Variable" : "Fixed"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td className="px-3 py-2" colSpan={2}>Fixed cost</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtCents(model.fixed_cost_cents)}</td>
                  <td className="px-3 py-2" />
                </tr>
                <tr className="bg-slate-50 font-semibold text-slate-800">
                  <td className="px-3 py-2" colSpan={2}>Variable cost</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtCents(model.variable_cost_cents)}</td>
                  <td className="px-3 py-2" />
                </tr>
                <tr className="border-t border-slate-200 bg-slate-100 font-semibold text-slate-900">
                  <td className="px-3 py-2" colSpan={2}>Total operating cost</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtCents(model.total_cost_cents)}</td>
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            </table>
            </div>
          </section>

          <p className="mt-4 text-xs text-slate-400">{data.disclaimer}</p>
        </>
      ) : null}
    </div>
  );
}
