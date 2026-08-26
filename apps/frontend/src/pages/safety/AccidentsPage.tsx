import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDateUS } from "../../lib/formatDate";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSafetyAccidentDetail, getSafetyAccidents } from "../../api/safety";
import { Button } from "../../components/Button";
import { AccidentReportDrawer } from "../../components/safety/AccidentReportDrawer";
import { DatePicker } from "../../components/forms/DatePicker";
import { companyNow } from "../../lib/businessDate";
import { EntityLink } from "../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { entityLabel } from "../../lib/entity-label";
import { ListErrorState } from "../../components/ListErrorState";
import { useStagedListFilters } from "../../components/table";

type AccidentRow = Record<string, unknown>;

type Props = {
  operatingCompanyId: string;
};

const EMPTY_FILTERS = { driverId: "", unitId: "", trailerId: "", from: "", to: "" };

// SAFE-1: render the persisted fault / DOT-preventability determinations. Null = not yet assessed.
function formatAtFault(value: unknown): string {
  if (value === "yes") return "Yes";
  if (value === "no") return "No";
  if (value === "disputed") return "Disputed";
  return "—";
}

function formatPreventable(value: unknown): string {
  if (value === true) return "Preventable";
  if (value === false) return "Not Preventable";
  return "—";
}

function createDraftAccident(): Record<string, unknown> {
  return {
    id: "__create__",
    status: "open",
    accident_at: companyNow(),
    location: "",
    notes: "",
    driver_id: "",
    unit_id: "",
    trailer_id: "",
  };
}

export function AccidentsPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAccident, setSelectedAccident] = useState<Record<string, unknown> | null>(null);
  // LV-SAFETY-ACCIDENTS-FILTER-SILENT-APPLY — client-side filters stage until Apply; Cancel restores.
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: setApplied,
  });
  const draft = staged.draft;

  const [searchParams, setSearchParams] = useSearchParams();
  const accidentIdParam = searchParams.get("accident_id");
  const loadIdFromUrl = searchParams.get("load_id")?.trim() ?? "";
  const driverIdFromUrl = searchParams.get("driver_id")?.trim() ?? "";
  const unitIdFromUrl = searchParams.get("unit_id")?.trim() ?? "";
  const trailerIdFromUrl = searchParams.get("trailer_id")?.trim() ?? "";

  // Seed picker filters from reverse Open-queue deep links (LINK-F5171) into applied (draft syncs when clean).
  useEffect(() => {
    if (!driverIdFromUrl && !unitIdFromUrl && !trailerIdFromUrl) return;
    setApplied((prev) => ({
      ...prev,
      ...(driverIdFromUrl ? { driverId: driverIdFromUrl } : {}),
      ...(unitIdFromUrl ? { unitId: unitIdFromUrl } : {}),
      ...(trailerIdFromUrl ? { trailerId: trailerIdFromUrl } : {}),
    }));
  }, [driverIdFromUrl, unitIdFromUrl, trailerIdFromUrl]);

  const accidentsQuery = useQuery({
    queryKey: [
      "safety",
      "accidents",
      operatingCompanyId,
      loadIdFromUrl,
      driverIdFromUrl,
      unitIdFromUrl,
      trailerIdFromUrl,
    ],
    queryFn: () =>
      getSafetyAccidents(operatingCompanyId, {
        load_id: loadIdFromUrl || undefined,
        driver_id: driverIdFromUrl || undefined,
        unit_id: unitIdFromUrl || undefined,
        trailer_id: trailerIdFromUrl || undefined,
      }),
    enabled: Boolean(operatingCompanyId),
  });

  // Reverse links must resolve the requested record directly. The list endpoint is capped and can
  // legitimately omit an older accident, so searching only its current page made a valid
  // ?accident_id= link land on an empty table instead of the record drawer.
  const linkedAccidentQuery = useQuery({
    queryKey: ["safety", "accident", operatingCompanyId, accidentIdParam],
    queryFn: () => getSafetyAccidentDetail(String(accidentIdParam), operatingCompanyId),
    enabled: Boolean(operatingCompanyId && accidentIdParam),
  });

  const allRows = accidentsQuery.data?.accidents ?? [];

  // SAF-F33 reverse drill-through: another module linking here as
  // /safety/accidents?accident_id=<id> opens that exact accident even when it is not in the capped list.
  useEffect(() => {
    if (!accidentIdParam) return;
    const match = linkedAccidentQuery.data;
    if (match) {
      setSelectedAccident(match);
      setDrawerOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("accident_id");
      setSearchParams(next, { replace: true });
    }
  }, [accidentIdParam, linkedAccidentQuery.data, searchParams, setSearchParams]);

  const rows = useMemo(() => {
    return allRows.filter((row) => {
      // SAF-F26: picker sets the canonical id; also accept name/number substring if typed legacy.
      if (applied.driverId) {
        const id = String(row.driver_id ?? "");
        const name = String(row.driver_name ?? "").toLowerCase();
        const needle = applied.driverId.trim().toLowerCase();
        if (id !== applied.driverId && !name.includes(needle) && id.toLowerCase() !== needle) return false;
      }
      if (applied.unitId) {
        const id = String(row.unit_id ?? "");
        const num = String(row.unit_number ?? "").toLowerCase();
        const needle = applied.unitId.trim().toLowerCase();
        if (id !== applied.unitId && !num.includes(needle) && id.toLowerCase() !== needle) return false;
      }
      if (applied.trailerId) {
        const id = String(row.trailer_id ?? "");
        const num = String(row.trailer_number ?? row.equipment_number ?? "").toLowerCase();
        const needle = applied.trailerId.trim().toLowerCase();
        if (id !== applied.trailerId && !num.includes(needle) && id.toLowerCase() !== needle) return false;
      }
      const accidentDate = String(row.accident_at ?? "").slice(0, 10);
      if (applied.from && accidentDate && accidentDate < applied.from) return false;
      if (applied.to && accidentDate && accidentDate > applied.to) return false;
      return true;
    });
  }, [allRows, applied]);
  const createMode = String(selectedAccident?.id ?? "") === "__create__";

  const openAccident = (row: Record<string, unknown>) => {
    setSelectedAccident(row);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedAccident(null);
  };

  // Migrated to the shared QBO-parity grid — columns, order, and the per-row "Open accident"
  // action are preserved verbatim (§7 additive-only).
  const columns: Array<ParityColumn<AccidentRow>> = [
    { key: "accident_at", label: "Date", sortable: true, render: (row) => formatDateUS(row.accident_at) },
    { key: "driver_id", label: "Driver", render: (row) => <EntityLink kind="driver" id={row.driver_id as string | undefined} label={entityLabel((row.driver_name as string | undefined)?.trim(), row.driver_id as string | undefined, "Driver")} /> },
    { key: "unit_id", label: "Unit", render: (row) => <EntityLink kind="unit" id={row.unit_id as string | undefined} label={entityLabel((row.unit_number as string | undefined)?.trim(), row.unit_id as string | undefined, "Unit")} /> },
    {
      key: "trailer_id",
      label: "Trailer",
      render: (row) => (
        <EntityLink
          kind="trailer"
          id={row.trailer_id as string | undefined}
          label={entityLabel(
            ((row.trailer_number as string | undefined) ?? (row.equipment_number as string | undefined))?.trim(),
            row.trailer_id as string | undefined,
            "Trailer",
          )}
        />
      ),
    },
    // SAF-B25: the load leg of the accident. safety.accident_reports.load_id has FKed mdata.loads
    // since the table existed and appeared on no list and in no join, so an accident could not be
    // read against the trip it happened on — the link an insurer, attorney or claims adjuster asks
    // for first. Added after Unit and before Location so the existing column order is otherwise
    // preserved verbatim (§7 additive-only).
    {
      key: "load_id",
      label: "Load",
      render: (row) => (
        <EntityLink kind="load" id={row.load_id as string | undefined} label={entityLabel((row.load_number as string | undefined)?.trim(), row.load_id as string | undefined, "Load")} />
      ),
    },
    {
      key: "vendor_id",
      label: "Vendor",
      render: (row) => (
        <EntityLink kind="vendor" id={row.vendor_id as string | undefined} label={entityLabel((row.vendor_name as string | undefined)?.trim(), row.vendor_id as string | undefined, "Vendor")} />
      ),
    },
    // C-02: reverse hop to the insurance claim this accident produced (insurance.claim.accident_report_id
    // → this row, joined server-side). No claim id → honest "—", never a fabricated link.
    {
      key: "claim_id",
      label: "Claim",
      render: (row) =>
        row.claim_id ? (
          <EntityLink
            kind="claim"
            id={row.claim_id as string}
            label={(row.claim_number as string | undefined)?.trim() || "Claim"}
            data-testid={`accident-row-claim-${String(row.id)}`}
          />
        ) : (
          "—"
        ),
    },
    { key: "location", label: "Location", render: (row) => String(row.location ?? row.description ?? "—") },
    { key: "at_fault", label: "At Fault", cellClass: "capitalize", render: (row) => formatAtFault(row.at_fault) },
    { key: "preventable", label: "Preventable", render: (row) => formatPreventable(row.preventable) },
    { key: "status", label: "Status", sortable: true, render: (row) => String(row.status ?? "open") },
    {
      key: "action",
      label: "Action",
      render: (row) => (
        <button type="button" className="text-slate-700 underline" onClick={() => openAccident(row)}>
          Open accident
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-3" data-testid="accidents-page">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 bg-white px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">Accidents & Incidents</div>
          <div className="text-[11px] text-slate-500">Live accident reports with damage details, photos, and maintenance WO spawn.</div>
        </div>
        <Button
          size="sm"
          data-testid="accidents-create-btn"
          onClick={() => {
            setSelectedAccident(createDraftAccident());
            setDrawerOpen(true);
          }}
        >
          + Create Accident
        </Button>
      </div>

      {/* CLS-LIST-ERROR-STATE-UNGUARDED: a failed query fell through to emptyText
          "No accident reports found." On an accident register that reads as a clean safety record —
          the outage and the all-clear are indistinguishable to a safety manager. */}
      {accidentsQuery.isError ? (
        <ListErrorState
          title="Couldn't load accident reports"
          status={0}
          message={(accidentsQuery.error as Error)?.message}
          onRetry={() => void accidentsQuery.refetch()}
        />
      ) : (
      <ParityTable<AccidentRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.id)}
        loading={accidentsQuery.isLoading}
        emptyText="No accident reports found."
        storageKey="safety-accidents"
        exportFilename="accidents"
        tableTestId="accidents-table"
        rowTestId={(row) => `accident-row-${String(row.id)}`}
        filterBar={
          <div className="flex flex-wrap items-center gap-2 text-[11px]" data-testid="accidents-filters">
            {/* SAF-F26: filters, not creators — allowCreate={false} (same law as IdvrPage). */}
            <label className="text-[11px] text-slate-600">
              Driver
              <EntityPicker
                kind="driver"
                operatingCompanyId={operatingCompanyId}
                value={draft.driverId || null}
                onChange={(next) => staged.setDraft((d) => ({ ...d, driverId: next ?? "" }))}
                allowCreate={false}
                placeholder="All drivers"
                className="mt-1 w-48"
                dataField="accidents-driver-filter"
                dataTestId="accidents-driver-filter"
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
                className="mt-1 w-48"
                dataField="accidents-unit-filter"
                dataTestId="accidents-unit-filter"
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
                className="mt-1 w-48"
                dataField="accidents-trailer-filter"
                dataTestId="accidents-trailer-filter"
              />
            </label>
            <label htmlFor="accidents-from-date" className="font-semibold text-slate-500">From:</label>
            <DatePicker
              id="accidents-from-date"
              value={draft.from}
              onChange={(next) => staged.setDraft((d) => ({ ...d, from: next }))}
              className="w-32"
              max={draft.to || undefined}
              data-testid="accidents-from-date"
            />
            <label htmlFor="accidents-to-date" className="font-semibold text-slate-500">To:</label>
            <DatePicker
              id="accidents-to-date"
              value={draft.to}
              onChange={(next) => staged.setDraft((d) => ({ ...d, to: next }))}
              className="w-32"
              min={draft.from || undefined}
              data-testid="accidents-to-date"
            />
            <Button type="button" size="sm" data-testid="accidents-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
              Apply
            </Button>
            <Button type="button" size="sm" variant="secondary" data-testid="accidents-filter-cancel" onClick={staged.cancel} disabled={!staged.dirty}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="accidents-filter-reset"
              onClick={() => {
                staged.cancel();
                setApplied(EMPTY_FILTERS);
              }}
            >
              Reset
            </Button>
          </div>
        }
      />
      )}

      <AccidentReportDrawer
        open={drawerOpen}
        operatingCompanyId={operatingCompanyId}
        accident={selectedAccident}
        createMode={createMode}
        onClose={closeDrawer}
        onUpdated={() => {
          void queryClient.invalidateQueries({ queryKey: ["safety"] });
        }}
      />
    </div>
  );
}
