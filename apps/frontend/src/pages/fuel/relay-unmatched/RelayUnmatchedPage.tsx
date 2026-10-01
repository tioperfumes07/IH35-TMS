/**
 * "Relay — unmatched" tab (ORDERS-2026-10-01, linkage law §6, PR #23729). Mirrors how the
 * Cards/Integrity tabs were added as standalone sub-pages (FuelCardsPage.tsx / FuelIntegrityPage.tsx):
 * GET /api/v1/fuel/relay-fills?unmatched=true, the risk window of Relay fills no truck or driver has
 * been matched to yet, with Relay's own free-text driver/unit so a person can match them by hand.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listRelayFills } from "../../../api/relay-fills";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { DataPanel } from "../../../components/layout/DataPanel";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { formatDateUS } from "../../../lib/formatDate";
import { formatMoneyCents } from "../../../components/dispatch/constants";
import type { RelayFillRow } from "../../../api/relay-fills";

const PAGE_SIZE = 50;

export function RelayUnmatchedPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["fuel", "relay-fills", "unmatched", companyId, page],
    queryFn: () => listRelayFills(companyId, { unmatched: true, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    enabled: Boolean(companyId),
  });

  const rows = query.data?.rows ?? [];
  const totalCount = query.data?.total_count ?? 0;

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
      <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-700" data-testid="relay-unmatched-page">
        Select an operating company to view unmatched Relay fills.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="relay-unmatched-page">
      <DataPanel
        title="Relay fills — unmatched"
        titleHint="Relay fuel fills this company has not matched to a truck or driver yet, with Relay's own free-text unit/driver to match by hand"
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
          />
        )}
        {totalCount > PAGE_SIZE ? (
          <div className="mt-2 flex items-center justify-between text-xs text-gray-600" data-testid="relay-unmatched-pager">
            <span>
              Page {page} of {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))} ({totalCount} total)
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
      </DataPanel>
    </div>
  );
}
