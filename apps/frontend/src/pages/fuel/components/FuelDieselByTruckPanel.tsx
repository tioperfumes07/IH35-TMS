// TABLE_DATE_OMIT: this table has no date column by design — one row per TRUCK aggregated over the period chosen in the panel's Oct / Sep / YTD period control — the period is the filter, not a column.
/**
 * ROUND 443.326 / 8.17 class L — KPI period via MoneyListToolbar + ParityTable + FuelBoardSection.
 * Seven Fuel.dc.html columns: graphic · Unit(+make/model) · Spend · $ · Gallons · $/gal · Fills · Loads.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { MoneyListToolbar } from "../../../components/table/MoneyListToolbar";
import { V3Segmented } from "../../../components/v3/V3Segmented";
import { formatMoneyCents } from "../../../lib/formatMoney";
import { formatQuantityTable, formatUsdRateTable } from "../../../lib/money";
import { QBO_MONEY_CELL_CLASS } from "../../../design/qbo-parity";
import { listMaintenanceVehicles } from "../../../api/maintenance";
import { fetchDieselByTruckAggregate } from "../fuelDieselByTruck";
import { fuelBoardPeriodOptions, fuelBoardPeriodRange, type FuelBoardPeriodId } from "../fuelBoardPeriod";
import { FuelBoardSection } from "../FuelBoardSection";
import { FleetTruck } from "../../maintenance/components/FleetHealthLine";

type Props = {
  companyId: string;
  maxRows?: number;
  viewAllHref?: string;
  /** Controlled Oct/Sep/YTD — when set with onPeriodChange, parent can period-sync FuelBoardKpiStrip. */
  period?: FuelBoardPeriodId;
  onPeriodChange?: (next: FuelBoardPeriodId) => void;
};

type DieselRow = {
  id: string;
  unit_id: string | null;
  unit_number: string;
  spend_cents: number;
  gallons: number;
  fill_count: number;
  load_count: number;
};

export function FuelDieselByTruckPanel({
  companyId,
  maxRows,
  viewAllHref,
  period: periodProp,
  onPeriodChange,
}: Props) {
  const [periodLocal, setPeriodLocal] = useState<FuelBoardPeriodId>("oct");
  const period = periodProp ?? periodLocal;
  const setPeriod = (next: FuelBoardPeriodId) => {
    if (onPeriodChange) onPeriodChange(next);
    else setPeriodLocal(next);
  };
  const [search, setSearch] = useState("");
  const range = fuelBoardPeriodRange(period);

  const aggQuery = useQuery({
    queryKey: ["fuel", "board", "diesel-by-truck", companyId, range.from, range.to],
    queryFn: () => fetchDieselByTruckAggregate(companyId, range.from, range.to),
    enabled: Boolean(companyId),
  });
  const vehiclesQuery = useQuery({
    queryKey: ["fuel", "board", "diesel-vehicle-identity", companyId],
    queryFn: () => listMaintenanceVehicles(companyId),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });
  const makeModelByUnitId = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vehiclesQuery.data?.rows ?? []) {
      const identity = [v.make, v.model].filter(Boolean).join(" ").trim();
      if (identity) map.set(v.id, identity);
    }
    return map;
  }, [vehiclesQuery.data?.rows]);

  const rows: DieselRow[] = useMemo(() => {
    const base = (aggQuery.data?.rows ?? []).map((r) => ({
      id: r.unit_id ?? r.unit_number,
      unit_id: r.unit_id,
      unit_number: r.unit_number,
      spend_cents: r.spend_cents,
      gallons: r.gallons,
      fill_count: r.fill_count,
      load_count: r.load_count,
    }));
    const q = search.trim().toLowerCase();
    const filtered = q
      ? base.filter((r) => {
          const identity = r.unit_id ? makeModelByUnitId.get(r.unit_id) ?? "" : "";
          return r.unit_number.toLowerCase().includes(q) || identity.toLowerCase().includes(q);
        })
      : base;
    return maxRows != null ? filtered.slice(0, maxRows) : filtered;
  }, [aggQuery.data?.rows, makeModelByUnitId, maxRows, search]);

  // ROUND 8.17 class S — same contract as Fuel Home: period fuel transactions for this unit (never unit profile).
  const historyHref = (unitId: string | null) =>
    unitId
      ? `/fuel/history?unit_id=${encodeURIComponent(unitId)}&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
      : `/fuel/history?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;

  const columns = useMemo<Array<ParityColumn<DieselRow>>>(
    () => [
      {
        key: "graphic",
        label: "",
        sortable: false,
        minWidth: 96,
        maxWidth: 110,
        render: () => <FleetTruck row={{ state: "ok", body_style: "aero" }} />,
      },
      {
        key: "unit_number",
        label: "Unit",
        sortable: true,
        minWidth: 140,
        sortValue: (r) => r.unit_number,
        render: (r) => {
          const identity = r.unit_id ? makeModelByUnitId.get(r.unit_id) : undefined;
          return (
            <div className="min-w-0" data-testid="fuel-diesel-unit-identity">
              {r.unit_id ? (
                <EntityLink kind="unit" id={r.unit_id} label={r.unit_number} className="font-semibold text-[#1F2A44]" />
              ) : (
                <span className="font-semibold">{r.unit_number}</span>
              )}
              <div className="truncate text-xs text-[#5B6576]">{identity || "—"}</div>
            </div>
          );
        },
      },
      {
        key: "spend_bar",
        label: "Spend",
        sortable: true,
        minWidth: 160,
        sortValue: (r) => r.spend_cents,
        render: (r) => {
          const max = Math.max(1, ...rows.map((x) => x.spend_cents));
          const pct = Math.max(0, Math.min(100, (r.spend_cents / max) * 100));
          return (
            <Link
              to={historyHref(r.unit_id)}
              className="flex min-w-0 items-center"
              data-testid="fuel-diesel-spend-bar"
              aria-label={`Open fuel history for ${r.unit_number}`}
            >
              <div className="h-1.5 min-w-[72px] flex-1 rounded-sm bg-[#EEF0F3]" aria-hidden>
                <div className="h-1.5 rounded-sm bg-[#14314F]" style={{ width: `${pct}%` }} />
              </div>
            </Link>
          );
        },
      },
      {
        key: "spend_cents",
        label: "$",
        sortable: true,
        minWidth: 88,
        className: QBO_MONEY_CELL_CLASS,
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.spend_cents,
        render: (r) => (
          <Link
            to={historyHref(r.unit_id)}
            className="shrink-0 whitespace-nowrap tabular-nums font-semibold text-[#1F2A44] hover:underline"
            data-testid="fuel-diesel-amount-drill"
          >
            {formatMoneyCents(r.spend_cents)}
          </Link>
        ),
      },
      {
        key: "gallons",
        label: "Gallons",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.gallons,
        render: (r) => (
          <Link to={historyHref(r.unit_id)} className="tabular-nums text-[#1F2A44] hover:underline" data-testid="fuel-diesel-gallons-drill">
            {formatQuantityTable(r.gallons, 1)}
          </Link>
        ),
      },
      {
        key: "per_gal",
        label: "$/gal",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => (r.gallons > 0 ? r.spend_cents / r.gallons : Number.POSITIVE_INFINITY),
        render: (r) =>
          r.gallons > 0 ? (
            <Link to={historyHref(r.unit_id)} className="tabular-nums text-[#1F2A44] hover:underline" data-testid="fuel-diesel-rate-drill">
              {formatUsdRateTable(r.spend_cents / 100 / r.gallons, 3)}
            </Link>
          ) : (
            "—"
          ),
      },
      {
        key: "fill_count",
        label: "Fills",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.fill_count,
        render: (r) => (
          <Link to={historyHref(r.unit_id)} className="tabular-nums text-[#1F2A44] hover:underline" data-testid="fuel-diesel-fills-drill">
            {formatQuantityTable(r.fill_count, 0)}
          </Link>
        ),
      },
      {
        key: "load_count",
        label: "Loads",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.load_count,
        render: (r) => (
          <Link to={historyHref(r.unit_id)} className="tabular-nums text-[#1F2A44] hover:underline" data-testid="fuel-diesel-loads-drill">
            {formatQuantityTable(r.load_count, 0)}
          </Link>
        ),
      },
    ],
    [makeModelByUnitId, range.from, range.to, rows],
  );

  return (
    <div className="space-y-3" data-testid="fuel-diesel-by-truck-panel">
      <MoneyListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search unit…"
        onClearAll={() => setSearch("")}
        activeFilterCount={search.trim() ? 1 : 0}
        testIdPrefix="fuel-diesel-by-truck"
      >
        <V3Segmented
          value={period}
          options={fuelBoardPeriodOptions()}
          onChange={setPeriod}
          testId="fuel-diesel-by-truck-period"
        />
        {viewAllHref ? (
          <Link
            to={viewAllHref}
            className="text-xs font-semibold text-[#1D4ED8]"
            data-testid="fuel-diesel-by-truck-view-all"
          >
            View all →
          </Link>
        ) : null}
      </MoneyListToolbar>

      <FuelBoardSection title="Diesel by truck" testId="fuel-diesel-by-truck-section">
        {aggQuery.isError ? <ListErrorBanner onRetry={() => void aggQuery.refetch()} /> : null}
        <ParityTable<DieselRow>
          appearance="board"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={aggQuery.isLoading}
          emptyText="No fills in this period."
          storageKey="fuel-diesel-by-truck"
          tableTestId="fuel-diesel-by-truck-table"
          suppressToolbarSearch
        />
      </FuelBoardSection>
    </div>
  );
}
