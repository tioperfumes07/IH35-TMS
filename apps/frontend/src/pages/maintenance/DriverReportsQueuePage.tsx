import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { listDriverReports, updateDriverReportStatus, type DriverReportRow } from "../../api/maintenance";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";

const LINK = "text-slate-700 hover:underline";

export function DriverReportsQueuePage({
  highlightedReportId = "",
  filterDriverId = "",
  filterLoadId = "",
}: {
  highlightedReportId?: string;
  filterDriverId?: string;
  filterLoadId?: string;
} = {}) {
  const { selectedCompanyId, companies } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? companies[0]?.id ?? "";
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [, setSearchParams] = useSearchParams();
  // BANK-F5168 — visible EntityPicker (URL/prop-only filter is not reverse chrome).
  const [driverPickerId, setDriverPickerId] = useState(filterDriverId);
  const [loadPickerId, setLoadPickerId] = useState(filterLoadId);
  useEffect(() => {
    if (filterDriverId) setDriverPickerId(filterDriverId);
  }, [filterDriverId]);
  useEffect(() => {
    if (filterLoadId) setLoadPickerId(filterLoadId);
  }, [filterLoadId]);
  // Driver/load filters commit via staged Apply (CLS-ADJACENT — no silent URL helpers).
  const effectiveDriverId = driverPickerId.trim() || filterDriverId || undefined;
  const effectiveLoadId = loadPickerId.trim() || filterLoadId || undefined;
  const [statusFilter, setStatusFilter] = useState<"" | DriverReportRow["status"]>("");
  const staged = useStagedListFilters({
    applied: {
      statusFilter,
      driverId: driverPickerId || filterDriverId || "",
      loadId: loadPickerId || filterLoadId || "",
    },
    empty: { statusFilter: "" as const, driverId: "", loadId: "" },
    onApply: (next) => {
      setStatusFilter(next.statusFilter);
      setDriverPickerId(next.driverId);
      setLoadPickerId(next.loadId);
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next.driverId) params.set("driver_id", next.driverId);
          else params.delete("driver_id");
          if (next.loadId) params.set("load_id", next.loadId);
          else params.delete("load_id");
          return params;
        },
        { replace: true },
      );
    },
  });
  // Free-text search: ParityTable toolbar owns it (MAINT-F3474) — no page-local searchSlot.
  const [resolutionDraft, setResolutionDraft] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["maintenance", "driver-reports", operatingCompanyId, statusFilter, effectiveDriverId, effectiveLoadId],
    queryFn: () =>
      listDriverReports({
        operating_company_id: operatingCompanyId,
        status: statusFilter || undefined,
        driver_id: effectiveDriverId,
        load_id: effectiveLoadId,
      }),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = useMemo(() => q.data?.rows ?? [], [q.data?.rows]);

  const mut = useMutation({
    mutationFn: (args: { id: string; status: "under_review" | "resolved" | "dismissed"; resolution_notes?: string }) =>
      updateDriverReportStatus(args.id, {
        operating_company_id: operatingCompanyId,
        status: args.status,
        resolution_notes: args.resolution_notes,
      }),
    onSuccess: async () => {
      pushToast("Driver report updated", "success");
      await qc.invalidateQueries({ queryKey: ["maintenance", "driver-reports", operatingCompanyId] });
    },
  });

  function reportedAt(iso: string) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  // Real DriverReportRow fields only — driver is the linkable record (no unit_id / linked_wo_id on this
  // entity; Load shown as text since there is no confirmed dispatch load-detail route to link safely).
  const columns: Array<ParityColumn<DriverReportRow>> = [
    { key: "reported_at", label: "Reported", sortable: true, render: (row) => reportedAt(row.reported_at) },
    { key: "report_type", label: "Type", sortable: true },
    {
      key: "driver_name",
      label: "Driver",
      sortable: true,
      render: (row) => <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" className={LINK} data-testid="driver-reports-queue-driver-link" />,
    },
    { key: "load_number", label: "Load", render: (row) => <EntityLinkOrTombstone kind="load" id={row.load_id ?? undefined} name={row.load_number} noun="Load" /> },
    {
      key: "description",
      label: "Description",
      render: (row) => (
        <div>
          <p className="whitespace-pre-wrap text-xs text-gray-700">{row.description}</p>
          {row.latitude != null && row.longitude != null ? (
            <p className="mt-1 text-[11px] text-gray-500">
              {row.latitude}, {row.longitude}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "evidence",
      label: "Evidence",
      render: (row) => (
        <div className="text-[11px] text-gray-700">
          Photos: {row.photo_r2_paths?.length ?? 0} · Voice: {row.voice_memo_r2_path ? "yes" : "no"}
        </div>
      ),
    },
    { key: "status", label: "Status", sortable: true },
  ];

  const rowActions = (row: DriverReportRow) => (
    <div className="w-56 space-y-1">
      <textarea
        rows={2}
        className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
        placeholder="Resolution notes..."
        value={resolutionDraft[row.id] ?? ""}
        onChange={(event) => setResolutionDraft((current) => ({ ...current, [row.id]: event.target.value }))}
      />
      <div className="flex gap-1">
        <Button size="sm" variant="secondary" onClick={() => mut.mutate({ id: row.id, status: "under_review" })}>
          Review
        </Button>
        <Button size="sm" onClick={() => mut.mutate({ id: row.id, status: "resolved", resolution_notes: resolutionDraft[row.id] ?? undefined })}>
          Resolve
        </Button>
        <Button size="sm" variant="danger" onClick={() => mut.mutate({ id: row.id, status: "dismissed", resolution_notes: resolutionDraft[row.id] ?? undefined })}>
          Dismiss
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Driver Reports Queue</h2>
      </div>

      {q.isError ? (
        <ListErrorState
          title="Couldn't load driver reports"
          status={0}
          message={(q.error as Error)?.message}
          onRetry={() => void q.refetch()}
        />
      ) : (
      <ParityTable<DriverReportRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        rowClassName={(row) => highlightedReportId && row.id === highlightedReportId ? "bg-slate-100 ring-1 ring-slate-400" : ""}
        loading={q.isLoading}
        emptyText="No driver reports found."
        storageKey="maint-damage-reports"
        exportFilename="driver-reports"
        rowActions={rowActions}
        filterBar={
          <div data-driver-reports-filter-toolbar="collapsed">
            <CollapsedListFilters
              activeFilterCount={(statusFilter ? 1 : 0) + (effectiveDriverId ? 1 : 0) + (effectiveLoadId ? 1 : 0)}
              onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}
              testIdPrefix="driver-reports"
            >
              <div className="flex flex-wrap items-end gap-3" data-testid="driver-reports-entity-filters">
                <label className="text-[11px] text-slate-600">
                  Driver
                  <EntityPicker
                    kind="driver"
                    operatingCompanyId={operatingCompanyId}
                    value={staged.draft.driverId || null}
                    onChange={(next) => staged.setDraft({ ...staged.draft, driverId: next ?? "" })}
                    allowCreate={false}
                    placeholder="All drivers"
                    className="mt-1"
                    dataTestId="driver-reports-filter-driver"
                  />
                </label>
                <label className="text-[11px] text-slate-600">
                  Load
                  <EntityPicker
                    kind="load"
                    operatingCompanyId={operatingCompanyId}
                    value={staged.draft.loadId || null}
                    onChange={(next) => staged.setDraft({ ...staged.draft, loadId: next ?? "" })}
                    allowCreate={false}
                    placeholder="All loads"
                    className="mt-1"
                    dataTestId="driver-reports-filter-load"
                  />
                </label>
                <label className="space-y-1 text-xs text-gray-600">
                  <span>Status</span>
                  <SelectCombobox
                    className="min-h-12 w-full rounded-sm border border-gray-300 px-2 text-sm sm:h-9 sm:min-h-0"
                    value={staged.draft.statusFilter}
                    onChange={(event) => staged.setDraft({ ...staged.draft, statusFilter: event.target.value as "" | DriverReportRow["status"] })}
                  >
                    <option value="">All statuses</option>
                    <option value="submitted">submitted</option>
                    <option value="under_review">under_review</option>
                    <option value="resolved">resolved</option>
                    <option value="dismissed">dismissed</option>
                  </SelectCombobox>
                </label>
              </div>
            </CollapsedListFilters>
          </div>
        }
      />
      )}
    </div>
  );
}
