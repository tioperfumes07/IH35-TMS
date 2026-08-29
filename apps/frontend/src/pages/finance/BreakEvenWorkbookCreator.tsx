import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { formatUsdCents } from "../../lib/money";
import {
  createScenario,
  FINANCE_HUB_SCENARIOS_FLAG,
  listScenarios,
  type LineTemplate,
} from "../../api/financeScenarios";
import { computeBreakEven } from "../../api/financeBreakEven";

/** Categories taken from Desktop `BREAK EVEN ANALYSIS IH 35 TRUCKINGS.xlsx` (2025 notes/leases + operating costs). */
export const BREAK_EVEN_WORKBOOK_NOTE = "break-even workbook · 2025 IH35 analysis";

const DEFAULT_LINES: LineTemplate[] = [
  { category_kind: "revenue", category_label: "Freight revenue", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
  { category_kind: "expense", category_label: "BMO note / lease", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
  { category_kind: "expense", category_label: "ENGS / Mitsubishi", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
  { category_kind: "expense", category_label: "PNC", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
  { category_kind: "expense", category_label: "AMUR", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
  { category_kind: "expense", category_label: "Continental", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
  { category_kind: "expense", category_label: "TBK", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
  { category_kind: "expense", category_label: "Hitachi", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
  { category_kind: "expense", category_label: "Auxilior", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
  { category_kind: "expense", category_label: "North Mills", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
  { category_kind: "expense", category_label: "Crossroads", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
  { category_kind: "expense", category_label: "Volvo Financial", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
  { category_kind: "expense", category_label: "United Leasing", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
  { category_kind: "expense", category_label: "Vehicle T139–T146", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
  { category_kind: "expense", category_label: "CCG reefers", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
  { category_kind: "expense", category_label: "Insurance", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
  { category_kind: "expense", category_label: "Fuel", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
  { category_kind: "expense", category_label: "Driver pay / labor", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
  { category_kind: "expense", category_label: "Maintenance, tires, roadside", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
  { category_kind: "expense", category_label: "Licenses / permits / HVUT 2290", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
  { category_kind: "expense", category_label: "Factoring / cash cost", assumption_note: BREAK_EVEN_WORKBOOK_NOTE, monthly_estimate_cents: 0 },
];

type Props = {
  operatingCompanyId: string;
  liveMiles: number;
  liveRevenueCents: number;
};

export function BreakEvenWorkbookCreator({ operatingCompanyId, liveMiles, liveRevenueCents }: Props) {
  const { enabled } = useFeatureFlag(FINANCE_HUB_SCENARIOS_FLAG, operatingCompanyId);
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [name, setName] = useState("Break-even analysis");
  const [periodStart, setPeriodStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [miles, setMiles] = useState(String(liveMiles || ""));
  const [lines, setLines] = useState<LineTemplate[]>(() => DEFAULT_LINES.map((l) => ({ ...l })));
  const [newVehicle, setNewVehicle] = useState("");

  const historyQuery = useQuery({
    queryKey: ["finance", "scenarios", operatingCompanyId, "break-even-workbook"],
    queryFn: () => listScenarios(operatingCompanyId),
    enabled: Boolean(operatingCompanyId) && enabled,
  });
  const history = useMemo(
    () => (historyQuery.data?.scenarios ?? []).filter((s) => (s.notes ?? "").includes("break-even workbook")),
    [historyQuery.data?.scenarios],
  );

  const revenueCents = lines.filter((l) => l.category_kind === "revenue").reduce((s, l) => s + (l.monthly_estimate_cents || 0), 0);
  const expenseCents = lines.filter((l) => l.category_kind === "expense").reduce((s, l) => s + (l.monthly_estimate_cents || 0), 0);
  const modelMiles = Math.max(0, Number(miles) || 0);
  const preview = computeBreakEven({
    miles: modelMiles,
    days: 30,
    revenue_cents: revenueCents || liveRevenueCents,
    fixed_cost_cents: expenseCents,
    variable_cost_cents: 0,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      createScenario({
        operating_company_id: operatingCompanyId,
        name: name.trim() || "Break-even analysis",
        period_basis: "monthly",
        period_start: periodStart,
        period_count: 12,
        notes: BREAK_EVEN_WORKBOOK_NOTE,
        line_templates: lines.filter((l) => (l.monthly_estimate_cents || 0) > 0 || l.category_kind === "revenue"),
      }),
    onSuccess: () => {
      pushToast("Break-even workbook saved (draft scenario). History is on Finance → Scenarios.", "success");
      void qc.invalidateQueries({ queryKey: ["finance", "scenarios", operatingCompanyId] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to save break-even workbook"), "error"),
  });

  if (!enabled) {
    return (
      <section className="mt-6 rounded-sm border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600" data-testid="break-even-workbook-flag-off">
        Break-even creator saves through Finance Scenarios. Enable flag <code>{FINANCE_HUB_SCENARIOS_FLAG}</code>, then return here to input expenses, notes, and assets from the 2025 workbook.
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-sm border border-slate-200 bg-white p-4" data-testid="break-even-workbook-creator">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">+ Create break-even analysis</h2>
          <p className="text-xs text-slate-500">
            Input the 2025 workbook shape: per-lender notes/leases, vehicle clusters (T139–T146, CCG reefers), plus operating costs. Use + Add vehicle for another unit. Saves as a Finance Scenario.
          </p>
        </div>
        <Link className="text-xs font-semibold text-slate-700 underline" to="/finance/scenarios">
          Open scenario history
        </Link>
      </div>
      {historyQuery.isError ? (
        // GO-0028: a failed fetch used to make this line silently disappear (history=[] on
        // error, same as genuinely no saved workbooks) -- now it says so instead.
        <p className="mb-3 text-xs text-red-700" data-testid="break-even-workbook-history-error">
          Unable to load saved workbook history.{" "}
          <button type="button" className="font-semibold underline" onClick={() => void historyQuery.refetch()}>
            Retry
          </button>
        </p>
      ) : history.length > 0 ? (
        <p className="mb-3 text-xs text-slate-600" data-testid="break-even-workbook-history">
          Saved workbooks: {history.map((s) => s.name).join(" · ")}
        </p>
      ) : null}
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-slate-600">
          Name
          <input className="mt-1 h-8 w-full rounded-sm border border-slate-300 px-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Period starts
          <DatePicker className="mt-1" value={periodStart} onChange={setPeriodStart} />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Miles (month)
          <input type="number" min={0} className="mt-1 h-8 w-full rounded-sm border border-slate-300 px-2 text-sm" value={miles} onChange={(e) => setMiles(e.target.value)} />
        </label>
      </div>
      <div className="space-y-2">
        {lines.map((line, idx) => (
          <div key={`${line.category_kind}-${line.category_label}`} className="grid gap-2 sm:grid-cols-[7rem_1fr_8rem] sm:items-center">
            <span className="text-[11px] font-semibold uppercase text-slate-500">{line.category_kind}</span>
            <span className="text-xs text-slate-800">{line.category_label}</span>
            <MoneyInput
              valueCents={line.monthly_estimate_cents}
              onChangeCents={(cents) => {
                setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, monthly_estimate_cents: cents ?? 0 } : row)));
              }}
              ariaLabel={line.category_label}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-slate-600">
          Add vehicle / unit
          <input
            className="mt-1 h-8 w-48 rounded-sm border border-slate-300 px-2 text-sm"
            value={newVehicle}
            onChange={(e) => setNewVehicle(e.target.value)}
            placeholder="T147"
          />
        </label>
        <button
          type="button"
          className="h-8 rounded-sm border border-slate-300 px-3 text-xs font-semibold text-slate-800"
          onClick={() => {
            const label = newVehicle.trim();
            if (!label) return;
            setLines((prev) => [
              ...prev,
              {
                category_kind: "expense",
                category_label: `Vehicle ${label}`,
                assumption_note: BREAK_EVEN_WORKBOOK_NOTE,
                monthly_estimate_cents: 0,
              },
            ]);
            setNewVehicle("");
          }}
        >
          + Add vehicle
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs">
        <span>
          Preview break-even {preview.total_cost_per_mile_cents == null ? "—" : `$${(preview.total_cost_per_mile_cents / 100).toFixed(3)}/mi`} · expenses {formatUsdCents(expenseCents)}
        </span>
        <button
          type="button"
          className="rounded-sm bg-[#1f2a44] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          disabled={saveMutation.isPending || !operatingCompanyId || revenueCents + expenseCents <= 0}
          onClick={() => saveMutation.mutate()}
        >
          + Create workbook
        </button>
      </div>
    </section>
  );
}
