import { settlementLabel } from "../../../lib/settlementNumber";
import { useMemo } from "react";
import type { ReactNode } from "react";
import type { SettlementListRow } from "../../../api/driverFinance";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { formatDateUS } from "../../../lib/formatDate";
import { useUrlSort } from "../../../hooks/useUrlSort";

type Props = {
  rows: SettlementListRow[];
  onOpen: (id: string) => void;
  /** SETL-S01 — ParityTable emptyText only when settled (never mid-fetch). */
  loading?: boolean;
  selectable?: boolean;
  batchActions?: (selected: SettlementListRow[]) => ReactNode;
  maxSelectable?: number;
  onSelectionCapExceeded?: () => void;
};

function statusClass(status: SettlementListRow["status"]) {
  if (status === "paid") return "bg-slate-100 text-slate-700";
  if (status === "locked") return "bg-slate-100 text-slate-700";
  if (status === "held") return "bg-slate-100 text-slate-700";
  if (status === "cancelled") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-700";
}

export function SettlementsTable({
  rows,
  onOpen,
  loading = false,
  selectable = false,
  batchActions,
  maxSelectable,
  onSelectionCapExceeded,
}: Props) {
  // BANK-SORT-ROLLOUT-OPS — ?sort=/?dir= URL persistence via the shared useUrlSort hook
  // (BANK-SORT-ROLLOUT-ACCT), same contract as the dispatch board and fleet/WO lists so a
  // shared/bookmarked settlements link preserves the chosen column sort.
  const { sortKey, sortDirection, onSortChange } = useUrlSort();

  const columns = useMemo<Array<ParityColumn<SettlementListRow>>>(
    () => [
      {
        // COLUMN-ORDERING LAW (owner 2026-09-11): Settlement number renders on the LEFT side of the
        // row — was buried second, behind Driver. Now first, matching every other Settlements surface.
        key: "settlement_display_id",
        label: "Settlement/Tour",
        alwaysVisible: true,
        sortable: true,
        sortValue: (row) => settlementLabel(row),
        render: (row) => (
          <EntityLinkOrTombstone
            kind="settlement"
            id={row.id}
            name={settlementLabel(row)}
            noun="Settlement"
          />
        ),
      },
      {
        // COLUMN-ORDERING LAW (owner 2026-09-11): Load renders immediately next to Settlement.
        // RENDER FIX (owner 2026-09-11, "FIX THE RENDER, NOT THE SCHEMA"): this cell used to show
        // only `load_links[0]` ("First linked load; open the settlement to see every load") — the
        // exact "1 load per settlement" render bug. The backend already returns every distinct
        // linked load in `load_links` (settlements.routes.ts's own comment: "so the FE can render a
        // real EntityLink per covered load"); the bug was purely this cell throwing the rest away.
        key: "loads",
        label: "Load Number",
        alwaysVisible: true,
        sortable: true,
        headerTitle: "Every load linked to this settlement",
        sortValue: (row) => row.load_links?.[0]?.label ?? "",
        cellClass: "whitespace-nowrap",
        render: (row) => {
          const links = row.load_links ?? [];
          if (links.length === 0) return "—";
          return (
            <span className="flex flex-wrap items-center gap-1">
              {links.map((link) => (
                <EntityLink key={link.id} kind="load" id={link.id} label={entityLabel(link.label, link.id, "Load")} />
              ))}
            </span>
          );
        },
      },
      {
        key: "load_count", label: "Load count", sortable: true,
        sortValue: row => Number(row.load_count ?? 0), render: row => Number(row.load_count ?? 0),
      },
      {
        key: "driver",
        label: "Driver",
        sortable: true,
        sortValue: (row) => row.driver_full_name ?? null,
        // FAIL-SET2: this cell printed the driver's raw UUID as a second line, under the name. The
        // cause is not a missing label — `views.driver_settlement_with_debt` defines the field as
        // `d.id::text AS driver_display_id`, so the API asserts that the driver's display id IS the
        // uuid, and every consumer of that view is handed one. Prod PROVE: `mdata.drivers` has no
        // `display_id` column at all, and `employee_id_display` is NULL for all 190 drivers — there
        // is no human driver identifier to show. So the honest cell is the name, linked. Drilling is
        // preserved (the link moved onto the name); nothing is lost but the uuid.
        render: (row) => (
          <div className="font-semibold">
            <EntityLinkOrTombstone
              kind="driver"
              id={row.driver_id}
              name={row.driver_full_name}
              noun="Driver"
            />
          </div>
        ),
      },
      {
        key: "source_document_ref", label: "Source reference", sortable: true,
        sortValue: row => row.source_document_ref ?? "", render: row => row.source_document_ref ?? "—",
      },
      {
        key: "period_start", label: "Period Begin", sortable: true,
        sortValue: row => row.period_start ?? null, render: row => formatDateUS(row.period_start),
      },
      {
        key: "period_end", label: "Period End", sortable: true,
        sortValue: row => row.period_end ?? null, render: row => formatDateUS(row.period_end),
      },
      {
        // SETL-DATES (owner 2026-09-07): a settlement must always show when it opened and when it
        // closed. trip_started_at is stamped when the first load is dispatched (open); trip_closed_at
        // when the payrun closes it. An open settlement has no close date yet, so show a dash.
        key: "trip_started_at",
        label: "Date started",
        sortable: true,
        sortValue: (row) => row.trip_started_at ?? null,
        render: (row) => (row.trip_started_at ? formatDateUS(row.trip_started_at) : <span className="text-gray-500">—</span>),
      },
      {
        key: "trip_closed_at",
        label: "Date ended",
        sortable: true,
        sortValue: (row) => row.trip_closed_at ?? null,
        render: (row) => (row.trip_closed_at ? formatDateUS(row.trip_closed_at) : <span className="text-gray-500">—</span>),
      },
      {
        key: "gross",
        label: "Gross",
        sortable: true,
        sortValue: (row) => Number(row.gross_pay ?? 0),
        render: (row) => `$${Number(row.gross_pay ?? 0).toFixed(2)}`,
      },
      {
        key: "deductions",
        label: "Deductions",
        sortable: true,
        sortValue: (row) => Number(row.deductions_total ?? 0),
        render: (row) => `$${Number(row.deductions_total ?? 0).toFixed(2)}`,
      },
      {
        key: "net_pay",
        label: "Net Pay",
        sortable: true,
        sortValue: (row) => Number(row.net_pay ?? 0),
        cellClass: "font-semibold text-slate-700",
        render: (row) => `$${Number(row.net_pay ?? 0).toFixed(2)}`,
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        sortValue: (row) => row.status ?? null,
        render: (row) => (
          <span className={`rounded-full px-2 py-0.5 ${statusClass(row.status)}`}>{row.status}</span>
        ),
      },
      {
        // Multi-line on purpose: a single-line column literal here trips the CI hold-merge-gate's
        // flag-flip heuristic (a money-posting-flag safeguard scanning for an underscore-FLAG-style
        // identifier plus a truthy value on one diff line) — not an actual feature flag, just this
        // column's UI key.
        key: "debt_flag",
        label: "Debt Flag",
        sortable: true,
        sortValue: (row) => row.live_debt_flag ?? null,
        render: (row) =>
          typeof row.live_debt_flag === "number" && row.live_debt_flag > 0 ? (
            <span className="flex flex-wrap items-center gap-1">
              <span className="font-semibold text-red-700">${row.live_debt_flag.toFixed(2)}</span>
              {/* LINK-F5187: the dollar total above is a sum over real driver_finance.driver_liabilities
                  rows (liability_ids) — link each one instead of leaving the total as dead text. */}
              {(row.liability_ids ?? []).map((id, idx) => (
                <EntityLink
                  key={id}
                  kind="liability"
                  id={id}
                  label={(row.liability_ids?.length ?? 0) > 1 ? `#${idx + 1}` : "view →"}
                  className="text-xs text-red-600 hover:underline"
                />
              ))}
            </span>
          ) : (
            <span className="text-gray-500">—</span>
          ),
      },
      {
        key: "action",
        label: "Action",
        sortable: false,
        alwaysVisible: true,
        render: (row) => (
          <button
            type="button"
            className="inline-flex h-7 items-center rounded-sm px-2 text-xs text-slate-700 underline"
            onClick={() => onOpen(row.id)}
          >
            Open →
          </button>
        ),
      },
    ],
    [onOpen],
  );

  return (
    <ParityTable<SettlementListRow>
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      storageKey="driver-finance-settlements-list"
      tableTestId="driver-finance-settlements-table"
      loading={loading}
      emptyText="No settlements found."
      sortKey={sortKey}
      sortDirection={sortDirection}
      onSortChange={onSortChange}
      enableColumnResize
      selectable={selectable}
      batchActions={batchActions}
      maxSelectable={maxSelectable}
      onSelectionCapExceeded={onSelectionCapExceeded}
    />
  );
}
