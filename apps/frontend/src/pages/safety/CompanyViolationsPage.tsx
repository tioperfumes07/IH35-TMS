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
import { CompanyViolationCreateModal } from "./components/CompanyViolationCreateModal";
import { CompanyViolationDetailDrawer } from "./components/CompanyViolationDetailDrawer";

type Props = {
  operatingCompanyId: string;
};

type CompanyViolationRow = Record<string, unknown>;

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
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const driverIdFromUrl = searchParams.get("driver_id")?.trim() ?? "";
  const unitIdFromUrl = searchParams.get("unit_id")?.trim() ?? "";
  // LST-F5163G + LST-F5191: visible reverse filters must write URL params.
  const [driverFilter, setDriverFilterState] = useState(driverIdFromUrl);
  const [unitFilter, setUnitFilterState] = useState(unitIdFromUrl);

  useEffect(() => {
    setDriverFilterState(driverIdFromUrl);
  }, [driverIdFromUrl]);
  useEffect(() => {
    setUnitFilterState(unitIdFromUrl);
  }, [unitIdFromUrl]);

  function patchSearchParam(key: "driver_id" | "unit_id", next: string) {
    const p = new URLSearchParams(searchParams);
    if (next) p.set(key, next);
    else p.delete(key);
    setSearchParams(p, { replace: true });
  }
  function setDriverFilter(next: string) {
    setDriverFilterState(next);
    patchSearchParam("driver_id", next);
  }
  function setUnitFilter(next: string) {
    setUnitFilterState(next);
    patchSearchParam("unit_id", next);
  }

  const effectiveDriverId = driverFilter.trim() || driverIdFromUrl || undefined;
  const effectiveUnitId = unitFilter.trim() || unitIdFromUrl || undefined;

  const query = useQuery({
    queryKey: ["safety", "company-violations", operatingCompanyId, effectiveDriverId, effectiveUnitId],
    queryFn: () =>
      getCompanyViolations(operatingCompanyId, {
        driver_id: effectiveDriverId,
        unit_id: effectiveUnitId,
      }),
    enabled: Boolean(operatingCompanyId),
  });
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
          filterBar={
            <div className="relative flex flex-wrap items-center gap-2">
              <label className="text-[11px] text-slate-600">
                Driver
                <EntityPicker
                  kind="driver"
                  operatingCompanyId={operatingCompanyId}
                  value={driverFilter || null}
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
                  value={unitFilter || null}
                  onChange={(next) => setUnitFilter(next ?? "")}
                  allowCreate={false}
                  placeholder="All units"
                  className="mt-1"
                  dataTestId="company-violations-filter-unit"
                />
              </label>
            </div>
          }
        />
      )}

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
