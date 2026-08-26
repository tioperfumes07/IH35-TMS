import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { FinanceModuleTabs } from "./FinanceModuleTabs";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DatePicker } from "../../components/forms/DatePicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  activateScenario,
  createScenario,
  FINANCE_HUB_SCENARIOS_FLAG,
  listScenarios,
  type CategoryKind,
  type LineTemplate,
  type PeriodBasis,
  type Scenario,
  type ScenarioStatus,
} from "../../api/financeScenarios";

// FIN-S06 follow-up: this surface previously had no data model, no backend endpoint, and no
// operating_company_id query — a real placeholder. finance.forecast_scenarios (202612600000) +
// this page replace it. A scenario is versioned (draft/active/superseded), never deleted.

const STATUS_BADGE: Record<Scenario["status"], string> = {
  draft: "bg-slate-100 text-slate-700",
  active: "bg-slate-200 text-slate-800",
  superseded: "bg-gray-100 text-gray-500",
};

type LineDraft = LineTemplate & { key: string };

function emptyLine(): LineDraft {
  return {
    key: Math.random().toString(36).slice(2),
    category_kind: "revenue",
    category_label: "",
    assumption_note: "",
    monthly_estimate_cents: 0,
  };
}

export function FinanceScenariosPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag(FINANCE_HUB_SCENARIOS_FLAG, companyId);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [creatorOpen, setCreatorOpen] = useState(false);
  const [name, setName] = useState("");
  const [periodBasis, setPeriodBasis] = useState<PeriodBasis>("monthly");
  const [periodStart, setPeriodStart] = useState("");
  const [periodCount, setPeriodCount] = useState("12");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  // LV-FINANCE-SCENARIOS-FILTER-APPLY-MISSING — staged status + period_basis Filters.
  type ScenarioListFilter = { status: "all" | ScenarioStatus; periodBasis: "all" | PeriodBasis };
  const emptyFilter: ScenarioListFilter = { status: "all", periodBasis: "all" };
  const [appliedFilter, setAppliedFilter] = useState<ScenarioListFilter>(emptyFilter);
  const staged = useStagedListFilters({
    applied: appliedFilter,
    empty: emptyFilter,
    onApply: setAppliedFilter,
  });
  const activeFilterCount =
    (appliedFilter.status === "all" ? 0 : 1) + (appliedFilter.periodBasis === "all" ? 0 : 1);

  const scenariosQuery = useQuery({
    queryKey: ["finance", "scenarios", companyId],
    queryFn: () => listScenarios(companyId),
    enabled: Boolean(companyId) && enabled,
  });
  const scenarios = useMemo(() => {
    const rows = scenariosQuery.data?.scenarios ?? [];
    return rows.filter((s) => {
      if (appliedFilter.status !== "all" && s.status !== appliedFilter.status) return false;
      if (appliedFilter.periodBasis !== "all" && s.period_basis !== appliedFilter.periodBasis) return false;
      return true;
    });
  }, [scenariosQuery.data?.scenarios, appliedFilter]);

  const createMutation = useMutation({
    mutationFn: () =>
      createScenario({
        operating_company_id: companyId,
        name,
        period_basis: periodBasis,
        period_start: periodStart,
        period_count: Number(periodCount) || 1,
        notes: notes || null,
        line_templates: lines.map(({ key: _key, ...rest }) => rest),
      }),
    onSuccess: () => {
      pushToast("Scenario created (draft).", "success");
      setCreatorOpen(false);
      setName("");
      setPeriodStart("");
      setPeriodCount("12");
      setNotes("");
      setLines([emptyLine()]);
      void queryClient.invalidateQueries({ queryKey: ["finance", "scenarios", companyId] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to create scenario"), "error"),
  });

  const activateMutation = useMutation({
    mutationFn: (scenarioId: string) => activateScenario(scenarioId, companyId),
    onSuccess: () => {
      pushToast("Scenario activated.", "success");
      void queryClient.invalidateQueries({ queryKey: ["finance", "scenarios", companyId] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to activate scenario"), "error"),
  });

  const canSubmit = useMemo(
    () =>
      Boolean(
        companyId &&
          name.trim() &&
          periodStart &&
          Number(periodCount) > 0 &&
          lines.length > 0 &&
          lines.every((l) => l.category_label.trim() && l.assumption_note.trim())
      ),
    [companyId, name, periodStart, periodCount, lines]
  );

  const submitHint = useMemo(() => {
    if (!companyId) return "Select an operating company.";
    if (!name.trim()) return "Name is required.";
    if (!periodStart) return "First period start is required.";
    if (!(Number(periodCount) > 0)) return "Number of periods is required.";
    if (lines.length === 0) return "Add at least one line.";
    const incomplete = lines.find((l) => !l.category_label.trim() || !l.assumption_note.trim());
    if (incomplete && !incomplete.category_label.trim()) return "Each line needs a Category.";
    if (incomplete) return "Each line needs an Assumption.";
    return "";
  }, [companyId, name, periodStart, periodCount, lines]);

  const columns = useMemo<ParityColumn<Scenario>[]>(
    () => [
      {
        key: "name",
        label: "Name",
        render: (row) => (
          <Link to={`/finance/scenarios/${row.id}`} className="font-medium text-slate-800 hover:underline">
            {row.name}
          </Link>
        ),
      },
      {
        key: "status",
        label: "Status",
        render: (row) => (
          <span className={`rounded-sm px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status]}`}>{row.status}</span>
        ),
      },
      { key: "period_basis", label: "Basis" },
      { key: "period_count", label: "Periods" },
      { key: "period_start", label: "Starts" },
      {
        key: "actions",
        label: "",
        render: (row) =>
          row.status === "draft" ? (
            <button
              onClick={() => activateMutation.mutate(row.id)}
              disabled={activateMutation.isPending}
              className="rounded-sm border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Activate
            </button>
          ) : row.superseded_by_scenario_id ? (
            <span className="text-xs text-slate-400">superseded</span>
          ) : null,
      },
    ],
    [activateMutation]
  );

  const header = (
    <div className="mb-4">
      <h1 className="text-lg font-semibold text-slate-800">Scenarios</h1>
      <p className="text-sm text-slate-500">
        Versioned forecast scenarios — activate one at a time to drive Overview and Projections. Nothing posts to the GL.
      </p>
    </div>
  );

  if (flagLoading) {
    return (
      <div className="p-6">
        <FinanceModuleTabs />
        <PageHeader title="Scenarios" />
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="p-6" data-testid="finance-scenarios-page">
        <FinanceModuleTabs />
        {header}
        <div className="rounded-sm border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600" data-testid="finance-scenarios-not-available">
          Scenario planning is not yet enabled for this company. (Feature flag <code>{FINANCE_HUB_SCENARIOS_FLAG}</code> is off.)
        </div>
      </div>
    );
  }

  return (
    <div className="p-6" data-testid="finance-scenarios-page">
      <FinanceModuleTabs />
      {header}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <CollapsedListFilters
          activeFilterCount={activeFilterCount}
          onApply={staged.apply}
          onReset={staged.reset}
          onCancel={staged.cancel}
          applyDisabled={!staged.dirty}
          testIdPrefix="finance-scenarios"
          className="rounded-sm border border-slate-200 bg-white p-2"
        >
          <div className="flex flex-wrap gap-3">
            <label className="text-xs font-semibold text-slate-600">
              Status
              <select
                className="mt-1 block w-full min-w-[10rem] rounded-sm border border-slate-300 px-2 py-1 text-xs"
                value={staged.draft.status}
                onChange={(e) =>
                  staged.setDraft({ ...staged.draft, status: e.target.value as ScenarioListFilter["status"] })
                }
                data-testid="finance-scenarios-status-filter"
              >
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="superseded">Superseded</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Period basis
              <select
                className="mt-1 block w-full min-w-[10rem] rounded-sm border border-slate-300 px-2 py-1 text-xs"
                value={staged.draft.periodBasis}
                onChange={(e) =>
                  staged.setDraft({
                    ...staged.draft,
                    periodBasis: e.target.value as ScenarioListFilter["periodBasis"],
                  })
                }
                data-testid="finance-scenarios-period-basis-filter"
              >
                <option value="all">All bases</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </label>
          </div>
        </CollapsedListFilters>
        <button
          onClick={() => setCreatorOpen((v) => !v)}
          className="rounded-sm bg-[#1f2a44] px-4 py-2 text-sm font-medium text-white"
        >
          {creatorOpen ? "Cancel" : "+ Create Scenario"}
        </button>
      </div>

      {creatorOpen && (
        <section className="mb-6 overflow-hidden rounded-sm border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            New scenario
          </div>
          <div className="space-y-4 px-4 py-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Name *</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="FY27 Base Case"
                  className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Period basis</span>
                <select
                  value={periodBasis}
                  onChange={(e) => setPeriodBasis(e.target.value as PeriodBasis)}
                  className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">First period starts *</span>
                <div className="mt-1">
                  <DatePicker value={periodStart} onChange={setPeriodStart} />
                </div>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Number of periods *</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={periodCount}
                  onChange={(e) => setPeriodCount(e.target.value)}
                  className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Line items (each applies the same monthly estimate to every period)
                </span>
                <button
                  onClick={() => setLines((ls) => [...ls, emptyLine()])}
                  className="text-xs font-medium text-slate-700 underline"
                >
                  + Add line
                </button>
              </div>
              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div key={line.key} className="grid grid-cols-2 gap-2 border-t border-slate-100 py-3 md:grid-cols-6">
                    <label className="block">
                      <span className="text-xs font-medium text-slate-600">Kind</span>
                      <select
                        value={line.category_kind}
                        onChange={(e) =>
                          setLines((ls) =>
                            ls.map((l, i) => (i === idx ? { ...l, category_kind: e.target.value as CategoryKind } : l))
                          )
                        }
                        className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm"
                      >
                        <option value="revenue">Revenue</option>
                        <option value="expense">Expense</option>
                      </select>
                    </label>
                    <label className="block md:col-span-1">
                      <span className="text-xs font-medium text-slate-600">Category *</span>
                      <input
                        value={line.category_label}
                        onChange={(e) =>
                          setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, category_label: e.target.value } : l)))
                        }
                        placeholder="Line-haul revenue"
                        className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="text-xs font-medium text-slate-600">Assumption *</span>
                      <input
                        value={line.assumption_note}
                        onChange={(e) =>
                          setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, assumption_note: e.target.value } : l)))
                        }
                        placeholder="5% growth over trailing 3mo avg"
                        className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-slate-600">Monthly estimate ($)</span>
                      <div className="mt-1">
                        <MoneyInput
                          valueCents={line.monthly_estimate_cents}
                          onChangeCents={(cents) =>
                            setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, monthly_estimate_cents: cents ?? 0 } : l)))
                          }
                          ariaLabel="Monthly estimate"
                        />
                      </div>
                    </label>
                    <div className="flex items-end">
                      {lines.length > 1 && (
                        <button
                          onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}
                          className="text-xs font-medium text-red-600 underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => createMutation.mutate()}
              disabled={!canSubmit || createMutation.isPending}
              title={!canSubmit ? submitHint : undefined}
              aria-describedby={!canSubmit ? "finance-scenario-submit-hint" : undefined}
              className="rounded-sm bg-[#1f2a44] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating…" : "Create scenario"}
            </button>
            {!canSubmit ? (
              <p id="finance-scenario-submit-hint" className="text-sm text-slate-600">
                {submitHint}
              </p>
            ) : null}
          </div>
        </section>
      )}

      {scenariosQuery.isError ? (
        <ListErrorState
          title="Couldn't load finance scenarios"
          status={0}
          message={userFacingApiError(scenariosQuery.error, "Failed to load scenarios")}
          onRetry={() => void scenariosQuery.refetch()}
        />
      ) : (
      <ParityTable<Scenario>
        columns={columns}
        rows={scenarios}
        rowKey={(r) => r.id}
        storageKey="finance-scenarios-list"
        tableTestId="finance-scenarios-table"
        emptyText="No scenarios yet — create one to start planning."
      />
      )}
    </div>
  );
}
