import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { getSafetyDvirSubmissions } from "../../api/safety";
import { Button } from "../../components/Button";
import { useListState } from "../../components/list-state";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { useStagedListFilters } from "../../components/table";

type Props = {
  operatingCompanyId: string;
};

type DvirRow = Record<string, unknown>;

const EMPTY_FILTERS = { driverId: "", unitId: "", trailerId: "", from: "", to: "" };

export function IdvrPage({ operatingCompanyId }: Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // LST-F5188 — EntityPicker filters must write URL params (on Apply, not silent draft).
  const unitIdFromUrl = searchParams.get("unit_id")?.trim() ?? "";
  const trailerIdFromUrl = searchParams.get("trailer_id")?.trim() ?? "";
  const driverIdFromUrl = searchParams.get("driver_id")?.trim() ?? "";

  // LV-SAFETY-IDVR-FILTER-SILENT-APPLY — stage until Apply; Cancel restores; URL sync on Apply/Reset.
  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    driverId: driverIdFromUrl,
    unitId: unitIdFromUrl,
    trailerId: trailerIdFromUrl,
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
      const p = new URLSearchParams(searchParams);
      if (next.driverId) p.set("driver_id", next.driverId);
      else p.delete("driver_id");
      if (next.unitId) p.set("unit_id", next.unitId);
      else p.delete("unit_id");
      if (next.trailerId) p.set("trailer_id", next.trailerId);
      else p.delete("trailer_id");
      setSearchParams(p, { replace: true });
    },
  });
  const draft = staged.draft;
  const pageSize = 50;
  const [page, setPage] = useState(1);

  useEffect(() => {
    setApplied((prev) => ({
      ...prev,
      driverId: driverIdFromUrl,
      unitId: unitIdFromUrl,
      trailerId: trailerIdFromUrl,
    }));
  }, [driverIdFromUrl, unitIdFromUrl, trailerIdFromUrl]);

  const queryParams = useMemo(
    () => ({
      driver_id: applied.driverId.trim() || undefined,
      unit_id: applied.unitId.trim() || undefined,
      trailer_id: applied.trailerId.trim() || undefined,
      from: applied.from ? new Date(`${applied.from}T00:00:00`).toISOString() : undefined,
      to: applied.to ? new Date(`${applied.to}T23:59:59`).toISOString() : undefined,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    [applied, page]
  );

  const listQuery = useQuery({
    queryKey: ["safety", "dvir", operatingCompanyId, queryParams],
    queryFn: () => getSafetyDvirSubmissions(operatingCompanyId, queryParams),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = listQuery.data?.submissions ?? [];
  const totalCount = listQuery.data?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  useEffect(() => setPage(1), [operatingCompanyId, applied]);
  // LIST-EMPTY: the empty message renders only after the DVIR query settles.
  const listState = useListState(listQuery, rows.length === 0);

  const columns = useMemo<Array<ParityColumn<DvirRow>>>(
    () => [
      {
        key: "submitted_at",
        label: "Submitted",
        sortable: true,
        render: (row) => String(row.submitted_at ?? "").slice(0, 16).replace("T", " "),
      },
      {
        key: "driver_id",
        label: "Driver",
        render: (row) => (
          <EntityLinkOrTombstone kind="driver" id={row.driver_id as string | undefined} name={row.driver_name} noun="Driver" />
        ),
      },
      {
        key: "unit_id",
        label: "Unit",
        render: (row) => (
          <EntityLinkOrTombstone kind="unit" id={row.unit_id as string | undefined} name={row.unit_number} noun="Unit" />
        ),
      },
      {
        key: "trailer_id",
        label: "Trailer",
        render: (row) => (
          <EntityLinkOrTombstone
            kind="trailer"
            id={row.trailer_id as string | undefined}
            name={row.trailer_number ?? row.equipment_number}
            noun="Trailer"
          />
        ),
      },
      { key: "type", label: "Type", sortable: true, render: (row) => String(row.type ?? "—").replace("_", " ") },
      {
        key: "correction_count",
        label: "Corrections",
        render: (row) => row.corrects_dvir_id ? "Correction" : String(row.correction_count ?? 0),
      },
      { key: "defect_count", label: "Defects", sortable: true, render: (row) => String(row.defect_count ?? 0) },
      { key: "defect_severity", label: "Severity", sortable: true, render: (row) => String(row.defect_severity ?? "none") },
      {
        key: "follow_up_wo_id",
        label: "WO",
        render: (row) => (
          <EntityLink
            kind="work_order"
            id={row.follow_up_wo_id as string | undefined}
            label={(row.follow_up_wo_id as string | undefined) ? "Open WO" : undefined}
          />
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3" data-testid="idvr-page">
      <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
        <div className="text-sm font-semibold text-slate-800">Vehicle Inspections (iDVIR / DVIR)</div>
        <div className="text-[11px] text-slate-500">
          Office queue of driver PWA submissions. Major defects block dispatch until follow-up work orders close.
        </div>
      </div>

      {/* CLS-LIST-ERROR-STATE-UNGUARDED: this page computed listState and then threw the error away —
          only `loading` reached ParityTable, which has no error branch, so a failed query fell through
          to emptyText "No DVIR submissions found for the selected filters." On a DVIR queue that reads
          as "no defects reported", which is the opposite of the truth and blocks nothing downstream. */}
      {listState.isError ? (
        <ListErrorState
          title="Couldn't load DVIR submissions"
          status={0}
          message={(listQuery.error as Error)?.message}
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
      <ParityTable<DvirRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.id)}
        loading={listState.isLoading}
        emptyText="No DVIR submissions found for the selected filters."
        storageKey="safety-idvr"
        exportFilename="dvir-submissions"
        tableTestId="idvr-table"
        rowTestId={(row) => `idvr-row-${String(row.id)}`}
        pageSize={pageSize}
        pageSizeOptions={[pageSize]}
        hidePager
        onRowClick={(row) => {
          const id = String(row.id ?? "").trim();
          if (id) navigate(`/safety/idvr/${encodeURIComponent(id)}`);
        }}
        filterBar={
          <div className="flex flex-wrap items-end gap-3" data-testid="idvr-filters">
            <div className="text-[11px] text-slate-600">
              <label htmlFor="idvr-filter-from">From</label>
              <DatePicker
                id="idvr-filter-from"
                value={draft.from}
                onChange={(next) => staged.setDraft((d) => ({ ...d, from: next }))}
                className="mt-1 block h-8 w-full"
                data-testid="idvr-filter-from"
              />
            </div>
            <div className="text-[11px] text-slate-600">
              <label htmlFor="idvr-filter-to">To</label>
              <DatePicker
                id="idvr-filter-to"
                value={draft.to}
                onChange={(next) => staged.setDraft((d) => ({ ...d, to: next }))}
                className="mt-1 block h-8 w-full"
                data-testid="idvr-filter-to"
              />
            </div>
            {/* C1 PICKER LAW: both were raw-UUID boxes. These are FILTERS, so allowCreate={false} —
                a filter narrows existing DVIR rows and must not create a driver or a unit. */}
            <label className="text-[11px] text-slate-600">
              Driver
              <EntityPicker
                kind="driver"
                operatingCompanyId={operatingCompanyId}
                value={draft.driverId || null}
                onChange={(next) => staged.setDraft((d) => ({ ...d, driverId: next ?? "" }))}
                allowCreate={false}
                placeholder="All drivers"
                className="mt-1"
                dataField="idvr-filter-driver"
                dataTestId="idvr-filter-driver"
              />
            </label>
            <label className="text-[11px] text-slate-600">
              Unit
              <EntityPicker
                kind="unit"
                operatingCompanyId={operatingCompanyId}
                value={draft.unitId || null}
                onChange={(next) => staged.setDraft((d) => ({ ...d, unitId: next ?? "" }))}
                allowCreate={false}
                placeholder="All units"
                className="mt-1"
                dataField="idvr-filter-unit"
                dataTestId="idvr-filter-unit"
              />
            </label>
            <label className="text-[11px] text-slate-600">
              Trailer
              <EntityPicker
                kind="trailer"
                operatingCompanyId={operatingCompanyId}
                value={draft.trailerId || null}
                onChange={(next) => staged.setDraft((d) => ({ ...d, trailerId: next ?? "" }))}
                allowCreate={false}
                placeholder="All trailers"
                className="mt-1"
                dataField="idvr-filter-trailer"
                dataTestId="idvr-filter-trailer"
              />
            </label>
            <Button type="button" size="sm" data-testid="idvr-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
              Apply
            </Button>
            <Button type="button" size="sm" variant="secondary" data-testid="idvr-filter-cancel" onClick={staged.cancel} disabled={!staged.dirty}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="idvr-filter-reset"
              onClick={() => {
                staged.cancel();
                setApplied(EMPTY_FILTERS);
                const p = new URLSearchParams(searchParams);
                p.delete("driver_id");
                p.delete("unit_id");
                p.delete("trailer_id");
                setSearchParams(p, { replace: true });
              }}
            >
              Reset
            </Button>
          </div>
        }
      />
      )}
      {!listState.isError && totalCount > pageSize ? (
        <div className="flex items-center justify-end gap-2 text-xs" data-testid="idvr-server-pager">
          <Button size="sm" variant="secondary" disabled={page <= 1 || listQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
          <span className="text-slate-600">Page {page} of {pageCount} · {totalCount} submissions</span>
          <Button size="sm" variant="secondary" disabled={page >= pageCount || listQuery.isFetching} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</Button>
        </div>
      ) : null}
    </div>
  );
}
