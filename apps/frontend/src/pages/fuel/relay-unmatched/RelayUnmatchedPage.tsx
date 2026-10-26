/**
 * "Relay — unmatched" tab (ORDERS-2026-10-01, linkage law §6, PR #23729). Mirrors how the
 * Cards/Integrity tabs were added as standalone sub-pages (FuelCardsPage.tsx / FuelIntegrityPage.tsx):
 * GET /api/v1/fuel/relay-fills?unmatched=true, the risk window of Relay fills no truck or driver has
 * been matched to yet, with Relay's own free-text driver/unit so a person can match them by hand.
 *
 * ROUND 443.326 — KPI + MoneyListToolbar + ParityTable + FuelBoardSection (no V3Panel). listRelayFills unchanged.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listRelayFills } from "../../../api/relay-fills";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { MoneyListToolbar } from "../../../components/table/MoneyListToolbar";
import { FuelBoardSection } from "../FuelBoardSection";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { formatDateUS } from "../../../lib/formatDate";
import { formatMoneyCents } from "../../../components/dispatch/constants";
import type { RelayFillRow } from "../../../api/relay-fills";

const PAGE_SIZE = 50;

function kpiValue(n: number | undefined, loading: boolean): string {
  if (loading) return "…";
  if (n == null) return "—";
  return String(n);
}

export function RelayUnmatchedPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["fuel", "relay-fills", "unmatched", companyId, page],
    queryFn: () => listRelayFills(companyId, { unmatched: true, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    enabled: Boolean(companyId),
  });

  const allRows = query.data?.rows ?? [];
  const q = search.trim().toLowerCase();
  const rows = q
    ? allRows.filter((row) =>
        [
          row.merchant_name,
          row.location_city,
          row.location_state,
          row.relay_unit_number,
          row.relay_driver_name,
          row.unit_number,
          row.driver_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : allRows;
  const totalCount = query.data?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const columns: ParityColumn<RelayFillRow>[] = [
    { key: "relay_created_at", label: "Date", sortable: true, render: (row) => formatDateUS(row.relay_created_at) },
    {
      key: "merchant_name",
      label: "Merchant",
      sortable: true,
      render: (row) =>
        [row.merchant_name, [row.location_city, row.location_state].filter(Boolean).join(", ")].filter(Boolean).join(" — ") || "—",
    },
    {
      key: "relay_unit_number",
      label: "Relay's unit",
      sortable: true,
      render: (row) => row.relay_unit_number || "—",
    },
    {
      key: "relay_driver_name",
      label: "Relay's driver",
      sortable: true,
      render: (row) => row.relay_driver_name || "—",
    },
    {
      key: "unit_number",
      label: "Matched truck",
      sortable: true,
      render: (row) => <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" />,
    },
    {
      key: "driver_name",
      label: "Matched driver",
      sortable: true,
      render: (row) => <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" />,
    },
    { key: "fuel_gallons", label: "Diesel gal", sortable: true, render: (row) => (row.fuel_gallons != null ? row.fuel_gallons.toFixed(1) : "—") },
    { key: "def_gallons", label: "DEF gal", sortable: true, render: (row) => (row.def_gallons != null ? row.def_gallons.toFixed(1) : "—") },
    {
      key: "total_amount_paid_cents",
      label: "Amount",
      sortable: true,
      render: (row) => formatMoneyCents(row.total_amount_paid_cents, "USD"),
    },
  ];

  if (!companyId) {
    return (
      <div className="space-y-3" data-testid="relay-unmatched-page">
        <FuelBoardSection title="Relay unmatched" testId="relay-unmatched-need-company">
          <div className="px-3.5 py-3 text-xs text-gray-700">
            Select an operating company to view unmatched Relay fills.
          </div>
        </FuelBoardSection>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="relay-unmatched-page">
      {/* ROUND 443.280 — one domain KPI row (no pagination tiles This page / Page size). */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}
        data-testid="relay-unmatched-v3-kpi-strip"
        data-relay-unmatched-v3-kpis="1"
      >
        <V3KpiTile
          label="Unmatched"
          value={kpiValue(query.isPending ? undefined : totalCount, query.isPending)}
          sub="fills needing a truck or driver"
          tone={totalCount > 0 ? "red" : "green"}
          testId="relay-unmatched-kpi-total"
        />
      </div>
      <MoneyListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search merchant, unit, driver…"
        onClearAll={() => setSearch("")}
        activeFilterCount={0}
        testIdPrefix="relay-unmatched"
      >
        <span />
      </MoneyListToolbar>
      <FuelBoardSection
        title="Relay fills — unmatched"
        subtitle="Relay fuel fills this company has not matched to a truck or driver yet, with Relay's own free-text unit/driver to match by hand"
        testId="relay-unmatched-v3-panel"
      >
        {query.isError ? (
          <ListErrorBanner onRetry={() => void query.refetch()} message="Unmatched Relay fills could not be loaded." />
        ) : (
          <ParityTable
            rows={rows}
            columns={columns}
            loading={query.isPending}
            storageKey="fuel-relay-unmatched"
            emptyText="No unmatched Relay fills."
            rowKey={(row) => row.id}
            suppressToolbarSearch
          />
        )}
        {totalCount > PAGE_SIZE ? (
          <div className="mt-2 flex items-center justify-between text-xs text-gray-600" data-testid="relay-unmatched-pager">
            <span>
              Page {page} of {pageCount} ({totalCount} total)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-sm border border-gray-300 px-2 py-1 disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="rounded-sm border border-gray-300 px-2 py-1 disabled:opacity-50"
                disabled={!query.data?.has_more}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </FuelBoardSection>
    </div>
  );
}
