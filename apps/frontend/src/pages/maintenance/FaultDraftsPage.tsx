import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { formatDateTimeUS } from "../../lib/formatDate";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useStagedListFilters } from "../../components/table";

const EMPTY_FILTERS = {
  unitId: "",
};

type FaultDraft = {
  id: string;
  display_id: string | null;
  wo_title: string | null;
  description: string | null;
  status: string;
  unit_number: string | null;
  fault_code: string | null;
  fault_severity: string | null;
  fault_occurred_at: string | null;
  unit_id: string;
};

function fetchDrafts(companyId: string) {
  return apiRequest<{ drafts: FaultDraft[] }>(
    `/api/v1/maintenance/auto-wo-drafts?operating_company_id=${encodeURIComponent(companyId)}`
  );
}

export function FaultDraftsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  // Vehicle profile "View fault history" → ?unit_id= (MaintenanceSnapshotSection).
  // LST-F5169 — visible EntityPicker (URL-only banner is not reverse chrome).
  // LV-FAULT-DRAFTS-FILTER-SILENT-APPLY — stage until Apply; URL on Apply/Reset.
  const deepLinkUnitId = searchParams.get("unit_id");
  const unitIdFromUrl = deepLinkUnitId?.trim() ?? "";

  function patchListSearchParam(next: { unitId: string }) {
    const params = new URLSearchParams(searchParams);
    if (next.unitId) params.set("unit_id", next.unitId);
    else params.delete("unit_id");
    setSearchParams(params, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    unitId: unitIdFromUrl,
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
      patchListSearchParam(next);
    },
  });
  const filterDraft = staged.draft;

  useEffect(() => {
    setApplied((prev) => ({ ...prev, unitId: unitIdFromUrl }));
  }, [unitIdFromUrl]);

  const setUnitFilter = (unitId: string) => {
    staged.setDraft((d) => ({ ...d, unitId }));
  };
  const effectiveUnitId = applied.unitId.trim() || undefined;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const draftsQuery = useQuery({
    queryKey: ["maintenance", "fault-drafts", companyId],
    queryFn: () => fetchDrafts(companyId),
    enabled: Boolean(companyId),
  });

  const confirmMutation = useMutation({
    mutationFn: (workOrderId: string) =>
      apiRequest(`/api/v1/maintenance/work-orders/${workOrderId}/transition`, {
        method: "POST",
        body: {
          operating_company_id: companyId,
          to_status: "open",
        },
      }),
    onSuccess: () => {
      pushToast("Draft work order confirmed and opened.", "success");
      queryClient.invalidateQueries({ queryKey: ["maintenance", "fault-drafts", companyId] });
      setSelectedId(null);
    },
    onError: () => pushToast("Could not confirm draft work order.", "error"),
  });

  const drafts = useMemo(() => {
    const all = draftsQuery.data?.drafts ?? [];
    if (!effectiveUnitId) return all;
    return all.filter((d) => d.unit_id === effectiveUnitId);
  }, [draftsQuery.data?.drafts, effectiveUnitId]);
  const selected = drafts.find((d) => d.id === selectedId) ?? null;

  const columns = useMemo<ParityColumn<FaultDraft>[]>(
    () => [
      { key: "unit_id", label: "Unit", render: (row) => <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" /> },
      { key: "fault_code", label: "Fault code", sortable: true, render: (row) => row.fault_code ?? "—" },
      { key: "fault_severity", label: "Severity", sortable: true, render: (row) => <span className="capitalize">{row.fault_severity ?? "—"}</span> },
      {
        key: "fault_occurred_at",
        label: "Occurred",
        sortable: true,
        render: (row) => (row.fault_occurred_at ? `${formatDateTimeUS(row.fault_occurred_at)} CT` : "—"),
      },
      { key: "status", label: "WO status", sortable: true, render: (row) => row.status },
      {
        key: "action",
        label: "Action",
        alwaysVisible: true,
        render: (row) => (
          <Button size="sm" variant="secondary" onClick={() => setSelectedId(row.id)}>
            Review
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Fault-Driven Drafts"
        subtitle="Auto-created draft work orders from high-severity Samsara fault codes — review, assign shop, and confirm."
      />
      <div className="flex gap-2 text-sm">
        <Link to="/maintenance" className="text-slate-700 underline">
          Maintenance home
        </Link>
        <span className="text-gray-400">·</span>
        <Link to="/maintenance/fault-rules" className="text-slate-700 underline">
          Fault rules
        </Link>
      </div>

      {draftsQuery.isError ? <p className="text-sm text-red-600">Failed to load fault-driven drafts.</p> : null}

      <div className="relative flex flex-wrap items-end gap-3" data-testid="fault-drafts-filters">
        <label className="text-[11px] text-slate-600">
          Unit
          <EntityPicker
            kind="unit"
            operatingCompanyId={companyId}
            value={filterDraft.unitId || null}
            onChange={(next) => setUnitFilter(next ?? "")}
            allowCreate={false}
            placeholder="All units"
            className="mt-1"
            dataTestId="fault-drafts-filter-unit"
          />
        </label>
        <Button type="button" size="sm" data-testid="fault-drafts-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
          Apply
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="fault-drafts-filter-cancel"
          onClick={staged.cancel}
          disabled={!staged.dirty}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="fault-drafts-filter-reset"
          onClick={() => {
            staged.cancel();
            setApplied(EMPTY_FILTERS);
            patchListSearchParam(EMPTY_FILTERS);
          }}
        >
          Reset
        </Button>
      </div>

      {deepLinkUnitId ? (
        <p className="text-xs text-slate-600" data-testid="fault-drafts-unit-reverse-banner">
          Showing fault-driven drafts for the selected unit ·{" "}
          <EntityLink kind="unit" id={deepLinkUnitId} label="Open unit profile" />
        </p>
      ) : null}

      <ParityTable
        rows={drafts}
        columns={columns}
        rowKey={(row) => row.id}
        loading={draftsQuery.isLoading}
        storageKey="maintenance-fault-drafts"
        emptyText={
          effectiveUnitId
            ? "No fault-driven drafts for this unit."
            : "No fault-driven draft work orders pending review."
        }
        exportFilename="fault-drafts"
      />

      {selected ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-sm bg-white p-4 shadow-lg">
            <h3 className="text-base font-semibold">{selected.wo_title ?? selected.display_id ?? "Draft WO"}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{selected.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <EntityLink
                kind="work_order"
                id={selected.id}
                label="Open WO detail"
                className="inline-flex items-center rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                data-testid="fault-draft-open-wo-link"
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={confirmMutation.isPending}
                onClick={() => confirmMutation.mutate(selected.id)}
              >
                Confirm &amp; open WO
              </Button>
              <Button size="sm" variant="tertiary" onClick={() => setSelectedId(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
