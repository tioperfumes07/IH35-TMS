import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDispatchPlannerWeek, type PlannerLoadEvent } from "../../../api/dispatch";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { userFacingApiError } from "../../../lib/api-error-message";
import { entityLabel } from "../../../lib/entity-label";
import { STATUS_LABEL } from "../../../components/dispatch/constants";
import { addDaysIso, widenPlannerRange } from "./planner-range";
import { usePlannerRange } from "./PlannerRangeContext";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { PlannerAxisHead } from "./PlannerAxisHead";
import { PlannerGrid } from "./PlannerGrid";
import { usePlannerLoads } from "./planner-bars";
import { PlannerViewToggle, type PlannerViewMode } from "./PlannerViewToggle";
import { SettlementReferenceCell } from "../../../components/settlements/SettlementReferenceCell";
import { useSettlementReferences } from "../../../hooks/useSettlementReferences";
import { useLoadCostRollups } from "../../../hooks/useLoadCostRollups";
import { formatMoneyCents } from "../../../components/dispatch/constants";

void PlannerAxisHead;

const DASH = "—";

type LoadListRow = {
  id: string;
  loadNumber: string;
  driver: string;
  unit: string;
  customer: string;
  status: string;
  pickupDate: string;
  deliveryDate: string;
  rate: string;
};

function toDayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

async function fetchLoadsForRange(operatingCompanyId: string, rangeStart: string, rangeEnd: string): Promise<PlannerLoadEvent[]> {
  // Enumerate the weeks first (bounded: the planner range is 7–40 days → ≤6 weeks), then fetch them in
  // PARALLEL. The previous code awaited each week sequentially inside the loop, so the planner stalled
  // for the sum of all round-trips on every load — the "Loads Planner hangs on load" symptom.
  const weekStarts: string[] = [];
  for (let weekStart = rangeStart; weekStart <= rangeEnd; weekStart = addDaysIso(weekStart, 7)) {
    weekStarts.push(weekStart);
  }
  const payloads = await Promise.all(weekStarts.map((w) => getDispatchPlannerWeek(operatingCompanyId, w)));
  const seen = new Map<string, PlannerLoadEvent>();
  for (const payload of payloads) {
    for (const load of payload.loads) {
      const day = toDayKey(load.start_at);
      if (day && day >= rangeStart && day <= rangeEnd) {
        seen.set(load.id, load);
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.start_at.localeCompare(b.start_at));
}

export function LoadsPlanner() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const { range, days, setRange } = usePlannerRange();
  const [viewMode, setViewMode] = useState<PlannerViewMode>("grid");

  const loadsQuery = useQuery({
    queryKey: ["dispatch", "planners", "loads", operatingCompanyId, range.start, range.end],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => fetchLoadsForRange(operatingCompanyId, range.start, range.end),
  });

  // Richer load rows (DispatchLoadRow) for the list view — includes driver name, unit, rate.
  const listLoadsQuery = usePlannerLoads(operatingCompanyId, range.start, range.end);
  const settlementReferences = useSettlementReferences(operatingCompanyId, (listLoadsQuery.data ?? []).map((load) => load.id));
  // LAW 5 / ROUND 153 (owner: "load boards ... rendering the exact same data"): the list view
  // used to show ONLY revenue (rate) — nothing to re-derive, but nothing to CROSS-CHECK against
  // load costs / pre-settlement / settlement either. Now reads the same canonical rollup those
  // screens read, batched for the whole visible list in one request.
  const costRollups = useLoadCostRollups(operatingCompanyId, (listLoadsQuery.data ?? []).map((load) => load.id));

  const rows = useMemo(() => loadsQuery.data ?? [], [loadsQuery.data]);

  if (!operatingCompanyId) {
    return (
      <div
        data-testid="dispatch-loads-planner-need-company"
        className="rounded-sm border bg-white p-4 text-xs text-slate-600"
      >
        Select an operating company to load the loads planner.
      </div>
    );
  }

  return (
    <div data-testid="dispatch-loads-planner-page" className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <PlannerViewToggle viewMode={viewMode} onChange={setViewMode} />
      </div>
      {loadsQuery.isLoading ? <div className="text-xs text-gray-500">Loading loads timeline…</div> : null}
      {loadsQuery.isError ? (
        <ListErrorBanner
          message={userFacingApiError(loadsQuery.error, "Could not load loads planner")}
          onRetry={() => void loadsQuery.refetch()}
        />
      ) : null}

      {!loadsQuery.isLoading && !loadsQuery.isError && viewMode === "list" ? (
        (() => {
          const listRows: LoadListRow[] = (listLoadsQuery.data ?? []).map((load) => ({
            id: load.id,
            loadNumber: load.load_number,
            driver: load.assigned_primary_driver_name ?? "—",
            unit: load.assigned_unit_number ?? "—",
            customer: load.customer_name ?? "—",
            // ROUND 20.6 L1 (owner-live 2026-09-12): raw enum values ("in_transit", "dispatched")
            // were shown to the user -- every other surface renders STATUS_LABEL.
            status: STATUS_LABEL[load.status as keyof typeof STATUS_LABEL] ?? load.status,
            pickupDate: load.pickup_scheduled_at ? load.pickup_scheduled_at.slice(0, 10) : "—",
            deliveryDate: load.scheduled_delivery_date ?? (load.delivery_appointment_start_at ? load.delivery_appointment_start_at.slice(0, 10) : "—"),
            rate: load.rate_total_cents != null
              ? `${load.currency_code === "MXN" ? "$" : "$"}${(load.rate_total_cents / 100).toFixed(2)}`
              : "—",
          }));
          const columns: Array<ParityColumn<LoadListRow>> = [
            { key: "loadNumber", label: "Load #", sortable: true, render: (row) => <EntityLinkOrTombstone kind="load" id={row.id} name={row.loadNumber} noun="Load" /> },
            { key: "settlementReference", label: "Settlement / Presettlement", testId: "settlement-reference-column", render: (row) => <SettlementReferenceCell reference={settlementReferences.get(row.id)} /> },
            { key: "driver", label: "Driver", sortable: true },
            { key: "unit", label: "Unit", sortable: true },
            { key: "customer", label: "Customer", sortable: true },
            { key: "status", label: "Status", sortable: true },
            { key: "pickupDate", label: "Pickup Date", sortable: true },
            { key: "deliveryDate", label: "Delivery Date", sortable: true },
            { key: "rate", label: "Rate", sortable: true },
            // LAW 5 / ROUND 153, extended ROUND 173 pt 4 — revenue/fuel/expenses/driver pay/net,
            // read from the SAME canonical rollup (load-cost-rollup.sql.ts) Load Costs,
            // Pre-Settlement and Settlement all read. Dash while the batch request is still
            // loading or a specific load has no rollup row yet — never a fabricated 0. Fuel and
            // Expenses are new (ROUND 173); Cost/Driver Pay/Margin kept unchanged (existing
            // testids, existing tests) alongside them, additive-only.
            {
              key: "loadFuel",
              label: "Fuel",
              testId: "load-fuel-column",
              sortValue: (row) => costRollups.get(row.id)?.fuel_cents ?? -Infinity,
              render: (row) => {
                const r = costRollups.get(row.id);
                return r ? formatMoneyCents(r.fuel_cents) : DASH;
              },
            },
            {
              key: "loadExpenses",
              label: "Expenses",
              testId: "load-expenses-column",
              sortValue: (row) => costRollups.get(row.id)?.expenses_cents ?? -Infinity,
              render: (row) => {
                const r = costRollups.get(row.id);
                return r ? formatMoneyCents(r.expenses_cents) : DASH;
              },
            },
            {
              key: "loadCost",
              label: "Cost",
              testId: "load-cost-column",
              sortValue: (row) => costRollups.get(row.id)?.costs_cents ?? -Infinity,
              render: (row) => {
                const r = costRollups.get(row.id);
                return r ? formatMoneyCents(r.costs_cents) : DASH;
              },
            },
            {
              key: "loadDriverPay",
              label: "Driver Pay",
              testId: "load-driver-pay-column",
              sortValue: (row) => costRollups.get(row.id)?.driver_pay_cents ?? -Infinity,
              render: (row) => {
                const r = costRollups.get(row.id);
                return r ? formatMoneyCents(r.driver_pay_cents) : DASH;
              },
            },
            {
              key: "loadMargin",
              label: "Net",
              testId: "load-margin-column",
              sortValue: (row) => costRollups.get(row.id)?.net_cents ?? -Infinity,
              render: (row) => {
                const r = costRollups.get(row.id);
                if (!r) return DASH;
                return <span className={r.net_cents < 0 ? "text-[#991B1B]" : undefined}>{formatMoneyCents(r.net_cents)}{r.margin_pct != null ? ` · ${r.margin_pct.toFixed(1)}%` : ""}</span>;
              },
            },
          ];
          return (
            <div data-testid="dispatch-loads-planner-list">
              <ParityTable<LoadListRow>
                columns={columns}
                rows={listRows}
                rowKey={(row) => row.id}
                loading={listLoadsQuery.isLoading}
                emptyText="No loads with a start_at in this range for this company."
                storageKey="dispatch-loads-planner-list"
                exportFilename="loads-planner"
              />
            </div>
          );
        })()
      ) : null}

      {!loadsQuery.isLoading && !loadsQuery.isError && viewMode === "grid" ? (
        <PlannerGrid
          days={days}
          frozenLabel="Load"
          frozenPx={260}
          statusLabel="Status"
          onExpandRange={(minYmd, maxYmd) => setRange(widenPlannerRange(range, minYmd, maxYmd))}
          rows={rows.map((load) => {
            const start = toDayKey(load.start_at) ?? days[0];
            const end = toDayKey(load.end_at) ?? start;
            const lane = [load.pickup_city, load.pickup_state].filter(Boolean).join(", ") || "—";
            return {
              id: load.id,
              name: <EntityLinkOrTombstone kind="load" id={load.id} name={load.load_number} noun="Load" />,
              // Planners lists, item 3 — plain-text keys for the sortable frozen columns.
              sortKey: load.load_number ?? undefined,
              statusSortKey: load.status ?? undefined,
              secondary: (
                <>
                  <span className="text-xs font-medium text-gray-600">{lane}</span>
                  <EntityLinkOrTombstone kind="customer" id={load.customer_id} name={load.customer_name} noun="Customer" />
                </>
              ),
              // ROUND 20.6 L1 -- same STATUS_LABEL mapping as the list view above.
              status: STATUS_LABEL[load.status as keyof typeof STATUS_LABEL] ?? load.status,
              bars: [
                {
                  id: `${load.id}-bar`,
                  // C1 (owner correction 2026-09-02): was `load.load_number || load.id` -- a raw
                  // uuid on the planner bar label the moment load_number is missing/blank.
                  label: entityLabel(load.load_number, load.id, "Load"),
                  startYmd: start,
                  endYmd: end,
                  kind: "nb" as const,
                  testId: `loads-planner-bar-${load.load_number}`,
                  loadId: load.id,
                },
              ],
            };
          })}
          empty={
            <span data-testid="dispatch-loads-planner-honest-empty">
              No loads with a start_at in this range for this company. Book or schedule loads under Dispatch — bars
              appear here once planner week feed returns load events.
            </span>
          }
        />
      ) : null}
    </div>
  );
}
