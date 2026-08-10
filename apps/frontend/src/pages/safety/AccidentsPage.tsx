import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDateUS } from "../../lib/formatDate";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSafetyAccidents } from "../../api/safety";
import { Button } from "../../components/Button";
import { AccidentReportDrawer } from "../../components/safety/AccidentReportDrawer";
import { DatePicker } from "../../components/forms/DatePicker";
import { companyNow } from "../../lib/businessDate";
import { EntityLink } from "../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { entityLabel } from "../../lib/entity-label";

type AccidentRow = Record<string, unknown>;

type Props = {
  operatingCompanyId: string;
};

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
  };
}

export function AccidentsPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAccident, setSelectedAccident] = useState<Record<string, unknown> | null>(null);
  // S-08 / S-04 + SAF-F26: driver/unit filters are EntityPickers (allowCreate=false) — operators
  // pick a real driver/unit; we match the selected id (plus name/number fallback for joined rows).
  const [driverFilter, setDriverFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const accidentsQuery = useQuery({
    queryKey: ["safety", "accidents", operatingCompanyId],
    queryFn: () => getSafetyAccidents(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const allRows = accidentsQuery.data?.accidents ?? [];

  // SAF-F33 reverse drill-through: another module linking here as
  // /safety/accidents?accident_id=<id> opens that accident's drawer once the list has loaded.
  const [searchParams, setSearchParams] = useSearchParams();
  const accidentIdParam = searchParams.get("accident_id");
  useEffect(() => {
    if (!accidentIdParam || allRows.length === 0) return;
    const match = allRows.find((r) => String(r.id) === accidentIdParam);
    if (match) {
      setSelectedAccident(match);
      setDrawerOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("accident_id");
      setSearchParams(next, { replace: true });
    }
  }, [accidentIdParam, allRows, searchParams, setSearchParams]);

  const rows = useMemo(() => {
    return allRows.filter((row) => {
      // SAF-F26: picker sets the canonical id; also accept name/number substring if typed legacy.
      if (driverFilter) {
        const id = String(row.driver_id ?? "");
        const name = String(row.driver_name ?? "").toLowerCase();
        const needle = driverFilter.trim().toLowerCase();
        if (id !== driverFilter && !name.includes(needle) && id.toLowerCase() !== needle) return false;
      }
      if (unitFilter) {
        const id = String(row.unit_id ?? "");
        const num = String(row.unit_number ?? "").toLowerCase();
        const needle = unitFilter.trim().toLowerCase();
        if (id !== unitFilter && !num.includes(needle) && id.toLowerCase() !== needle) return false;
      }
      const accidentDate = String(row.accident_at ?? "").slice(0, 10);
      if (fromDate && accidentDate && accidentDate < fromDate) return false;
      if (toDate && accidentDate && accidentDate > toDate) return false;
      return true;
    });
  }, [allRows, driverFilter, unitFilter, fromDate, toDate]);
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
    { key: "driver_id", label: "Driver", render: (row) => <EntityLink kind="driver" id={row.driver_id as string | undefined} label={(row.driver_name as string | undefined)?.trim() || "Driver"} /> },
    { key: "unit_id", label: "Unit", render: (row) => <EntityLink kind="unit" id={row.unit_id as string | undefined} label={(row.unit_number as string | undefined)?.trim() || "Unit"} /> },
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
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {/* SAF-F26: filters, not creators — allowCreate={false} (same law as IdvrPage). */}
            <label className="text-[11px] text-slate-600">
              Driver
              <EntityPicker
                kind="driver"
                operatingCompanyId={operatingCompanyId}
                value={driverFilter || null}
                onChange={(next) => setDriverFilter(next ?? "")}
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
                value={unitFilter || null}
                onChange={(next) => setUnitFilter(next ?? "")}
                allowCreate={false}
                placeholder="All units"
                className="mt-1 w-48"
                dataField="accidents-unit-filter"
                dataTestId="accidents-unit-filter"
              />
            </label>
            <span className="font-semibold text-slate-500">From:</span>
            <DatePicker value={fromDate} onChange={setFromDate} className="w-32" max={toDate || undefined} data-testid="accidents-from-date" />
            <span className="font-semibold text-slate-500">To:</span>
            <DatePicker value={toDate} onChange={setToDate} className="w-32" min={fromDate || undefined} data-testid="accidents-to-date" />
            {driverFilter || unitFilter || fromDate || toDate ? (
              <button
                type="button"
                className="rounded-full border border-gray-300 px-2 py-0.5 text-slate-500 hover:bg-gray-100"
                onClick={() => {
                  setDriverFilter("");
                  setUnitFilter("");
                  setFromDate("");
                  setToDate("");
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
        }
      />

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
