import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDateUS } from "../../lib/formatDate";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCompanyViolations } from "../../api/safety";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { Button } from "../../components/Button";
import { useStagedListFilters } from "../../components/table";
import { CompanyViolationCreateModal } from "./components/CompanyViolationCreateModal";
import { CompanyViolationDetailDrawer } from "./components/CompanyViolationDetailDrawer";

type Props = {
  operatingCompanyId: string;
};

type CompanyViolationRow = Record<string, unknown>;

const EMPTY_FILTERS = { driverId: "", unitId: "" };

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((id) => String(id)).filter(Boolean);
}

function asLabelMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

export function CompanyViolationsPage({ operatingCompanyId }: Props) {
  const pageSize = 50;
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const driverIdFromUrl = searchParams.get("driver_id")?.trim() ?? "";
  const unitIdFromUrl = searchParams.get("unit_id")?.trim() ?? "";
  // LST-F5163G + LST-F5191: visible reverse filters must write URL params on Apply.
  // LV-SAFETY-COMPANY-VIOLATIONS-FILTER-SILENT-APPLY — stage until Apply; Cancel restores.
  function patchSearchParam(next: { driverId: string; unitId: string }) {
    const p = new URLSearchParams(searchParams);
    if (next.driverId) p.set("driver_id", next.driverId);
    else p.delete("driver_id");
    if (next.unitId) p.set("unit_id", next.unitId);
    else p.delete("unit_id");
    setSearchParams(p, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    driverId: driverIdFromUrl,
    unitId: unitIdFromUrl,
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
      patchSearchParam(next);
    },
  });
  const draft = staged.draft;

  useEffect(() => {
    setApplied((prev) => ({
      ...prev,
      driverId: driverIdFromUrl,
      unitId: unitIdFromUrl,
    }));
  }, [driverIdFromUrl, unitIdFromUrl]);

  // Sibling verify-safety-alert-profile-reverse asserts setDriverFilter/setUnitFilter names — stage draft only.
  function setDriverFilter(next: string) {
    staged.setDraft((d) => ({ ...d, driverId: next }));
  }
  function setUnitFilter(next: string) {
    staged.setDraft((d) => ({ ...d, unitId: next }));
  }

  const effectiveDriverId = applied.driverId.trim() || undefined;
  const effectiveUnitId = applied.unitId.trim() || undefined;

  const query = useQuery({
    queryKey: ["safety", "company-violations", operatingCompanyId, effectiveDriverId, effectiveUnitId, page],
    queryFn: () =>
      getCompanyViolations(operatingCompanyId, {
        driver_id: effectiveDriverId,
        unit_id: effectiveUnitId,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
    enabled: Boolean(operatingCompanyId),
  });
  const totalCount = query.isError ? 0 : query.data?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  useEffect(() => setPage(1), [operatingCompanyId, effectiveDriverId, effectiveUnitId]);
  const rows = query.data?.company_violations ?? [];
  const violationId = searchParams.get("violation_id");
  useEffect(() => {
    if (!violationId) return;
    const match = rows.find((row) => String(row.id) === violationId);
    if (match) setSelected(match);
  }, [rows, violationId]);

  const columns: Array<ParityColumn<CompanyViolationRow>> = [
    { key: "reported_date", label: "Reported", sortable: true, render: (row) => formatDateUS(row.reported_date) },
    { key: "violation_type", label: "Type", sortable: true, render: (row) => String(row.violation_type ?? "—") },
    { key: "violation_severity", label: "Severity", sortable: true, render: (row) => String(row.violation_severity ?? "—") },
    {
      key: "related_driver_ids",
      label: "Driver",
      render: (row) => {
        const ids = asIdList(row.related_driver_ids);
        const labels = asLabelMap(row.related_driver_labels);
        if (ids.length === 0) return <span className="text-slate-400">—</span>;
        return (
          <span className="flex flex-wrap gap-1">
            {ids.slice(0, 2).map((id) => (
              <EntityLink key={id} kind="driver" id={id} label={entityLabel(labels[id], id, "Driver")} />
            ))}
            {ids.length > 2 ? <span className="text-slate-500">+{ids.length - 2}</span> : null}
          </span>
        );
      },
    },
    {
      key: "related_unit_ids",
      label: "Unit",
      render: (row) => {
        const ids = asIdList(row.related_unit_ids);
        const labels = asLabelMap(row.related_unit_labels);
        if (ids.length === 0) return <span className="text-slate-400">—</span>;
        return (
          <span className="flex flex-wrap gap-1">
            {ids.slice(0, 2).map((id) => (
              <EntityLink key={id} kind="unit" id={id} label={entityLabel(labels[id], id, "Unit")} />
            ))}
            {ids.length > 2 ? <span className="text-slate-500">+{ids.length - 2}</span> : null}
          </span>
        );
      },
    },
    { key: "description", label: "Description", render: (row) => String(row.description ?? "—") },
    { key: "status", label: "Status", sortable: true, render: (row) => String(row.status ?? "open") },
    {
      key: "action",
      label: "Action",
      render: (row) => (
        <button type="button" className="text-slate-700 underline" onClick={() => setSelected(row)}>
          Open
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-3" data-testid="company-violations-page">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-sm bg-[#1F2A44] px-3 py-1 text-xs font-semibold text-white"
          data-testid="company-violation-create-btn"
        >
          + Create Company Violation
        </button>
      </div>
      {query.isError ? (
        <ListErrorState
          title="Couldn't load company violations"
          status={0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ParityTable<CompanyViolationRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => String(row.id)}
          loading={query.isLoading}
          emptyText="No company violations found."
          storageKey="safety-company-violations"
          exportFilename="company-violations"
          tableTestId="company-violations-table"
          pageSize={pageSize}
          pageSizeOptions={[pageSize]}
          hidePager
          filterBar={
            <div className="relative flex flex-wrap items-end gap-2" data-testid="company-violations-filters">
              <label className="text-[11px] text-slate-600">
                Driver
                <EntityPicker
                  kind="driver"
                  operatingCompanyId={operatingCompanyId}
                  value={draft.driverId || null}
                  onChange={(next) => setDriverFilter(next ?? "")}
                  allowCreate={false}
                  placeholder="All drivers"
                  className="mt-1"
                  dataTestId="company-violations-filter-driver"
                />
              </label>
              <label className="text-[11px] text-slate-600">
                Unit
                <EntityPicker
                  kind="unit"
                  operatingCompanyId={operatingCompanyId}
                  value={draft.unitId || null}
                  onChange={(next) => setUnitFilter(next ?? "")}
                  allowCreate={false}
                  placeholder="All units"
                  className="mt-1"
                  dataTestId="company-violations-filter-unit"
                />
              </label>
              <Button type="button" size="sm" data-testid="company-violations-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
                Apply
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                data-testid="company-violations-filter-cancel"
                onClick={staged.cancel}
                disabled={!staged.dirty}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                data-testid="company-violations-filter-reset"
                onClick={() => {
                  staged.cancel();
                  setApplied(EMPTY_FILTERS);
                  patchSearchParam(EMPTY_FILTERS);
                }}
              >
                Reset
              </Button>
            </div>
          }
        />
      )}
      {!query.isError && totalCount > pageSize ? (
        <div className="flex items-center justify-end gap-2 text-xs" data-testid="company-violations-server-pager">
          <Button size="sm" variant="secondary" disabled={page <= 1 || query.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
          <span className="text-gray-600">Page {page} of {pageCount} · {totalCount} violations</span>
          <Button size="sm" variant="secondary" disabled={page >= pageCount || query.isFetching} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</Button>
        </div>
      ) : null}

      <CompanyViolationCreateModal
        open={createOpen}
        operatingCompanyId={operatingCompanyId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void queryClient.invalidateQueries({ queryKey: ["safety", "company-violations", operatingCompanyId] })}
      />
      <CompanyViolationDetailDrawer
        open={Boolean(selected)}
        violation={selected}
        operatingCompanyId={operatingCompanyId}
        onClose={() => setSelected(null)}
        onUpdated={() => void queryClient.invalidateQueries({ queryKey: ["safety", "company-violations", operatingCompanyId] })}
      />
    </div>
  );
}
