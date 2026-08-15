import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { getSafetyDvirSubmissions } from "../../api/safety";
import { useListState } from "../../components/list-state";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityPicker } from "../../components/parity/EntityPicker";

type Props = {
  operatingCompanyId: string;
};

type DvirRow = Record<string, unknown>;

export function IdvrPage({ operatingCompanyId }: Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // LST-F5188 — EntityPicker filters must write URL params (not local-only state).
  const unitIdFromUrl = searchParams.get("unit_id")?.trim() ?? "";
  const trailerIdFromUrl = searchParams.get("trailer_id")?.trim() ?? "";
  const driverIdFromUrl = searchParams.get("driver_id")?.trim() ?? "";
  const [driverFilter, setDriverFilterState] = useState(driverIdFromUrl);
  const [unitFilter, setUnitFilterState] = useState(unitIdFromUrl);
  const [trailerFilter, setTrailerFilterState] = useState(trailerIdFromUrl);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => { setDriverFilterState(driverIdFromUrl); }, [driverIdFromUrl]);
  useEffect(() => { setUnitFilterState(unitIdFromUrl); }, [unitIdFromUrl]);
  useEffect(() => { setTrailerFilterState(trailerIdFromUrl); }, [trailerIdFromUrl]);

  function patchSearchParam(key: "driver_id" | "unit_id" | "trailer_id", next: string) {
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
  function setTrailerFilter(next: string) {
    setTrailerFilterState(next);
    patchSearchParam("trailer_id", next);
  }

  const queryParams = useMemo(
    () => ({
      driver_id: driverFilter.trim() || undefined,
      unit_id: unitFilter.trim() || undefined,
      trailer_id: trailerFilter.trim() || trailerIdFromUrl || undefined,
      from: fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined,
      to: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined,
    }),
    [driverFilter, unitFilter, trailerFilter, trailerIdFromUrl, fromDate, toDate]
  );

  const listQuery = useQuery({
    queryKey: ["safety", "dvir", operatingCompanyId, queryParams],
    queryFn: () => getSafetyDvirSubmissions(operatingCompanyId, queryParams),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = listQuery.data?.submissions ?? [];
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
          <EntityLink kind="driver" id={row.driver_id as string | undefined} label={entityLabel(row.driver_name, row.driver_id, "Driver")} />
        ),
      },
      {
        key: "unit_id",
        label: "Unit",
        render: (row) => (
          <EntityLink kind="unit" id={row.unit_id as string | undefined} label={entityLabel(row.unit_number, row.unit_id, "Unit")} />
        ),
      },
      {
        key: "trailer_id",
        label: "Trailer",
        render: (row) => (
          <EntityLink
            kind="trailer"
            id={row.trailer_id as string | undefined}
            label={entityLabel(row.trailer_number ?? row.equipment_number, row.trailer_id, "Trailer")}
          />
        ),
      },
      { key: "type", label: "Type", sortable: true, render: (row) => String(row.type ?? "—").replace("_", " ") },
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
        onRowClick={(row) => {
          const id = String(row.id ?? "").trim();
          if (id) navigate(`/safety/idvr/${encodeURIComponent(id)}`);
        }}
        filterBar={
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[11px] text-slate-600">
              From
              <DatePicker
                value={fromDate}
                onChange={(next) => setFromDate(next)}
                className="mt-1 block h-8 w-full"
                data-testid="idvr-filter-from"
              />
            </label>
            <label className="text-[11px] text-slate-600">
              To
              <DatePicker
                value={toDate}
                onChange={(next) => setToDate(next)}
                className="mt-1 block h-8 w-full"
                data-testid="idvr-filter-to"
              />
            </label>
            {/* C1 PICKER LAW: both were raw-UUID boxes. These are FILTERS, so allowCreate={false} —
                a filter narrows existing DVIR rows and must not create a driver or a unit. */}
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
                dataField="idvr-filter-driver"
                dataTestId="idvr-filter-driver"
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
                dataField="idvr-filter-unit"
                dataTestId="idvr-filter-unit"
              />
            </label>
            <label className="text-[11px] text-slate-600">
              Trailer
              <EntityPicker
                kind="trailer"
                operatingCompanyId={operatingCompanyId}
                value={trailerFilter || null}
                onChange={(next) => setTrailerFilter(next ?? "")}
                allowCreate={false}
                placeholder="All trailers"
                className="mt-1"
                dataField="idvr-filter-trailer"
                dataTestId="idvr-filter-trailer"
              />
            </label>
          </div>
        }
      />
      )}
    </div>
  );
}
