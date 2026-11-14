import { useLocation, useSearchParams } from "react-router-dom";
import { userFacingApiError } from "../../../lib/api-error-message";
import { resolveBackHref } from "../../../lib/returnContext";
import { useMemo, useState } from "react";
import { DatePicker } from "../../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { ListErrorState } from "../../../components/ListErrorState";
import { PageHeader } from "../../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { BoardSection } from "../../../components/v3/BoardSection";
import { CollapsedListFilters, useStagedListFilters } from "../../../components/table";
import { formatDateTimeUS } from "../../../lib/formatDate";
import { formatQuantityTable } from "../../../lib/money";
import { resolveApiUrl } from "../../../api/client";
import { addDaysIso, companyToday } from "../../../lib/businessDate";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { SettlementReferenceCell } from "../../../components/settlements/SettlementReferenceCell";
import { useSettlementReferences } from "../../../hooks/useSettlementReferences";
// NOTE (EntityLink adoption sweep): `vehicle_id` here is the raw Samsara external vehicle id
// (dispatch.border_crossing_events.vehicle_id, sourced from integrations.samsara_positions —
// verified against apps/backend/src/integrations/samsara/border-crossings), NOT mdata.units.id.
// Do not wrap it in <EntityLink kind="unit"> — that would fabricate a dead /fleet/units/:id link.

interface CrossingEvent {
  uuid: string;
  vehicle_id: string;
  crossing_point: string;
  direction: string;
  entered_geofence_at: string;
  exited_geofence_at: string | null;
  customs_clearance_minutes: number | null;
  load_uuid: string | null;
}

const CROSSING_LABELS: Record<string, string> = {
  "laredo-i": "Laredo Bridge I (Gateway)",
  "laredo-ii": "Laredo Bridge II (Juarez-Lincoln)",
  "laredo-iii": "Laredo Bridge III (World Trade)",
  "laredo-iv": "Laredo Bridge IV (Colombia Solidarity)",
  colombia: "Colombia Bridge",
  other: "Other",
};

export function BorderCrossingHistory() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  // ROUND 8.20 board13/14 — Dispatch drills attach ?ret=; Back must restore origin.
  const dispatchBackHref = resolveBackHref({ searchParams, pathname, fallback: "/dispatch" });
  // DSP-F7280 — sessionStorage["operating_company_id"] is never written by this app. Reading it
  // kept this mounted page's query permanently disabled and rendered a false empty history. Use the
  // same reactive company source as every other entity-scoped surface so company switches refetch.
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const today = companyToday();
  const weekAgo = addDaysIso(today, -7);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const staged = useStagedListFilters({
    applied: { from, to },
    empty: { from: weekAgo, to: today },
    onApply: (next) => { setFrom(next.from); setTo(next.to); },
  });

  const { data, isLoading, isError, error, refetch } = useQuery<{ data: CrossingEvent[] }>({
    queryKey: ["border-crossings-history", operatingCompanyId, from, to],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl(`/api/v1/dispatch/border-crossings/history?operating_company_id=${encodeURIComponent(operatingCompanyId)}&from=${from}&to=${to}`),
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch border crossings");
      return res.json();
    },
    enabled: !!operatingCompanyId,
  });

  const events = data?.data ?? [];
  const settlementReferences = useSettlementReferences(operatingCompanyId, events.map((event) => event.load_uuid));

  // Migrated to the shared QBO-parity grid — columns and order preserved verbatim (§7 additive-only).
  const columns = useMemo<ParityColumn<CrossingEvent>[]>(
    () => [
      { key: "vehicle_id", label: "Vehicle", sortable: true },
      { key: "settlement_reference", label: "Settlement / Presettlement", testId: "settlement-reference-column", render: (event) => <SettlementReferenceCell reference={event.load_uuid ? settlementReferences.get(event.load_uuid) : null} /> },
      {
        key: "crossing_point",
        label: "Bridge",
        sortable: true,
        render: (ev) => CROSSING_LABELS[ev.crossing_point] ?? ev.crossing_point,
      },
      { key: "direction", label: "Direction", sortable: true, className: "capitalize", cellClass: "capitalize" },
      {
        key: "entered_geofence_at",
        label: "Entered",
        sortable: true,
        render: (ev) => `${formatDateTimeUS(ev.entered_geofence_at)} CT`,
      },
      {
        key: "exited_geofence_at",
        label: "Exited",
        sortable: true,
        render: (ev) => (ev.exited_geofence_at ? `${formatDateTimeUS(ev.exited_geofence_at)} CT` : "—"),
      },
      {
        key: "customs_clearance_minutes",
        label: "Customs (min)",
        sortable: true,
        render: (ev) =>
          ev.customs_clearance_minutes == null ? "—" : formatQuantityTable(ev.customs_clearance_minutes),
      },
    ],
    [settlementReferences],
  );

  if (!operatingCompanyId) {
    return (
      <div className="p-6" data-testid="gps-border-crossing-history-page">
        <PageHeader
          backHref={dispatchBackHref}
          title="GPS Border Crossing Events"
          subtitle="Geofence enter/exit events at USMCA ports"
        />
        <BoardSection title="GPS border crossings" testId="gps-border-crossing-need-company">
          <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company.</p>
        </BoardSection>
      </div>
    );
  }

  const filterBar = (
    <CollapsedListFilters
      activeFilterCount={from || to ? 1 : 0}
      onApply={staged.apply}
      onReset={staged.reset}
      onCancel={staged.cancel}
      applyDisabled={!staged.dirty}
      testIdPrefix="border-crossing"
      dataAttributes={{ "data-border-crossing-filter-toolbar": "collapsed" }}
    >
      <div className="relative flex flex-wrap items-center gap-4">
        <div>
          <label htmlFor="border-crossing-from" className="block text-xs font-medium text-gray-700 mb-1">
            From
          </label>
          <DatePicker box="filter"
            id="border-crossing-from"
            value={staged.draft.from}
            onChange={(next) => staged.setDraft({ ...staged.draft, from: next })}
            className=""
          />
        </div>
        <div>
          <label htmlFor="border-crossing-to" className="block text-xs font-medium text-gray-700 mb-1">
            To
          </label>
          <DatePicker box="filter"
            id="border-crossing-to"
            value={staged.draft.to}
            onChange={(next) => staged.setDraft({ ...staged.draft, to: next })}
            className=""
          />
        </div>
      </div>
    </CollapsedListFilters>
  );

  return (
    <div className="p-6 space-y-4" data-testid="gps-border-crossing-history-page">
      <PageHeader
        backHref={dispatchBackHref}
        title="GPS Border Crossing Events"
        subtitle="Geofence enter/exit events at USMCA ports"
      />
      {/* CLS-LIST-ERROR-STATE-UNGUARDED: a failed query fell through to the empty state — an outage
          presenting as a unit with no border crossings, on a USMCA cross-border compliance surface. */}
      {isError ? (
        <ListErrorState
          title="Couldn't load border crossings"
          status={0}
          message={userFacingApiError(error, "Couldn't load border crossings")}
          onRetry={() => void refetch()}
        />
      ) : (
      <ParityTable<CrossingEvent> appearance="board"
        columns={columns}
        rows={events}
        rowKey={(ev) => ev.uuid}
        loading={isLoading}
        emptyText="No border crossing events found for this period."
        storageKey="dispatch-border-crossing-gps-history"
        exportFilename="border-crossing-gps-history"
        filterBar={filterBar}
      />
      )}
    </div>
  );
}

export default BorderCrossingHistory;
