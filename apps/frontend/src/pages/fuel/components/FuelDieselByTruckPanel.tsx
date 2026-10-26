// TABLE_DATE_OMIT: this table has no date column by design — one row per TRUCK aggregated over the period chosen in the panel's Oct / Sep / YTD period control — the period is the filter, not a column.
/**
 * ROUND 443.326 — KPI period via MoneyListToolbar + ParityTable + FuelBoardSection (no V3Panel).
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
import { QBO_MONEY_CELL_CLASS } from "../../../design/qbo-parity";
import { fetchDieselByTruckAggregate } from "../fuelDieselByTruck";
import { FUEL_BOARD_PERIOD_OPTIONS, fuelBoardPeriodRange, type FuelBoardPeriodId } from "../fuelBoardPeriod";
import { FuelBoardSection } from "../FuelBoardSection";

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
    const filtered = q ? base.filter((r) => r.unit_number.toLowerCase().includes(q)) : base;
    return maxRows != null ? filtered.slice(0, maxRows) : filtered;
  }, [aggQuery.data?.rows, maxRows, search]);

  const columns = useMemo<Array<ParityColumn<DieselRow>>>(
    () => [
      {
        key: "unit_number",
        label: "Unit",
        sortable: true,
        sortValue: (r) => r.unit_number,
        render: (r) =>
          r.unit_id ? (
            <EntityLink kind="unit" id={r.unit_id} label={r.unit_number} className="font-semibold text-[#1F2A44]" />
          ) : (
            <span className="font-semibold">{r.unit_number}</span>
          ),
      },
      {
        key: "spend_cents",
        label: "Spend",
        sortable: true,
        className: QBO_MONEY_CELL_CLASS,
        sortValue: (r) => r.spend_cents,
        render: (r) => formatMoneyCents(r.spend_cents),
      },
      {
        key: "gallons",
        label: "Gallons",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.gallons,
        render: (r) => r.gallons.toFixed(1),
      },
      {
        key: "per_gal",
        label: "$/gal",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => (r.gallons > 0 ? r.spend_cents / r.gallons : Number.POSITIVE_INFINITY),
        render: (r) => (r.gallons > 0 ? (r.spend_cents / 100 / r.gallons).toFixed(3) : "—"),
      },
      {
        key: "fill_count",
        label: "Fills",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.fill_count,
        render: (r) => String(r.fill_count),
      },
      {
        key: "load_count",
        label: "Loads",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.load_count,
        render: (r) => String(r.load_count),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3" data-testid="fuel-diesel-by-truck-panel">
      <MoneyListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search unit…"
        onClearAll={() => setSearch("")}
        activeFilterCount={0}
        testIdPrefix="fuel-diesel-by-truck"
      >
        <V3Segmented
          value={period}
          options={FUEL_BOARD_PERIOD_OPTIONS}
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
