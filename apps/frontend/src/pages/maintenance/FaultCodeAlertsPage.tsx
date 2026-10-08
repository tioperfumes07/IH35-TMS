/**
 * E-40 — Maintenance FAULTS view (Round 306).
 * Consumes GET /api/v1/maintenance/fault-code-alerts (route live; rows arrive when E-10 ticks).
 * Notification deep-link: /maintenance/fault-code-alerts/:id
 * Unit reverse: ?unit_id= · Driver reverse: ?driver_id= (API admits at most one).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { listFaultCodeAlerts, type FaultCodeAlertRow } from "../../api/maintenance";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateTimeUS } from "../../lib/formatDate";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityPicker } from "../../components/EntityPicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useStagedListFilters } from "../../components/table";

const EMPTY_FILTERS = {
  unitId: "",
  driverId: "",
};

export function FaultCodeAlertsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { id: deepLinkFaultId } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const unitIdFromUrl = searchParams.get("unit_id")?.trim() ?? "";
  const driverIdFromUrl = searchParams.get("driver_id")?.trim() ?? "";

  function patchListSearchParam(next: { unitId: string; driverId: string }) {
    const params = new URLSearchParams(searchParams);
    // API: at most one of unit_id / driver_id.
    if (next.unitId) {
      params.set("unit_id", next.unitId);
      params.delete("driver_id");
    } else if (next.driverId) {
      params.set("driver_id", next.driverId);
      params.delete("unit_id");
    } else {
      params.delete("unit_id");
      params.delete("driver_id");
    }
    setSearchParams(params, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    unitId: unitIdFromUrl && !driverIdFromUrl ? unitIdFromUrl : "",
    driverId: driverIdFromUrl && !unitIdFromUrl ? driverIdFromUrl : "",
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      // Prefer unit when both staged (API mutually exclusive).
      const cleaned =
        next.unitId.trim()
          ? { unitId: next.unitId.trim(), driverId: "" }
          : { unitId: "", driverId: next.driverId.trim() };
      setApplied(cleaned);
      patchListSearchParam(cleaned);
    },
  });
  const filterDraft = staged.draft;

  useEffect(() => {
    setApplied({
      unitId: unitIdFromUrl && !driverIdFromUrl ? unitIdFromUrl : "",
      driverId: driverIdFromUrl && !unitIdFromUrl ? driverIdFromUrl : "",
    });
  }, [unitIdFromUrl, driverIdFromUrl]);

  const effectiveUnitId = applied.unitId.trim() || undefined;
  const effectiveDriverId = applied.driverId.trim() || undefined;

  const alertsQuery = useQuery({
    queryKey: ["maintenance", "fault-code-alerts", companyId, effectiveUnitId ?? "", effectiveDriverId ?? ""],
    queryFn: () =>
      listFaultCodeAlerts(companyId, {
        unitId: effectiveUnitId,
        driverId: effectiveDriverId,
        limit: 200,
      }),
    enabled: Boolean(companyId),
  });

  const rows = useMemo(() => (alertsQuery.isError ? [] : alertsQuery.data?.rows ?? []), [alertsQuery.data?.rows, alertsQuery.isError]);

  useEffect(() => {
    if (!deepLinkFaultId) return;
    const el = document.querySelector(`[data-testid="fault-alert-${deepLinkFaultId}"]`);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [deepLinkFaultId, rows]);

  const deepLinkRow = deepLinkFaultId ? rows.find((r) => r.id === deepLinkFaultId) : undefined;

  const columns = useMemo<ParityColumn<FaultCodeAlertRow>[]>(
    () => [
      {
        key: "occurred_at",
        label: "Occurred",
        sortable: true,
        render: (row) => (row.occurred_at ? `${formatDateTimeUS(row.occurred_at)} CT` : "—"),
      },
      {
        key: "unit_id",
        label: "Unit",
        render: (row) => <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" />,
      },
      {
        key: "driver_id",
        label: "Driver",
        render: (row) =>
          row.driver_id ? (
            <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_label} noun="Driver" />
          ) : (
            "—"
          ),
      },
      { key: "fault_code", label: "Fault code", sortable: true, render: (row) => row.fault_code ?? "—" },
      {
        key: "severity",
        label: "Severity",
        sortable: true,
        render: (row) => <span className="capitalize">{row.severity ?? "—"}</span>,
      },
      { key: "source", label: "Source", sortable: true, render: (row) => row.source ?? "—" },
      {
        key: "auto_wo_id",
        label: "Work order",
        render: (row) =>
          row.auto_wo_id ? (
            <EntityLinkOrTombstone kind="work_order" id={row.auto_wo_id} name={row.auto_wo_display_id} noun="Work order" />
          ) : (
            "—"
          ),
      },
      {
        key: "resolved_at",
        label: "Resolved",
        sortable: true,
        render: (row) => (row.resolved_at ? `${formatDateTimeUS(row.resolved_at)} CT` : "Open"),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4 p-4" data-testid="fault-code-alerts-page">
      <PageHeader
        title="Faults"
        subtitle="Samsara fault codes by unit and driver-at-the-time — open alerts, history, and linked auto work orders."
      />
      <div className="flex flex-wrap gap-2 text-xs">
        <Link to="/maintenance" className="text-[#4B5563] underline">
          Maintenance home
        </Link>
        <span className="text-gray-400">·</span>
        <Link to="/maintenance/fault-drafts" className="text-[#4B5563] underline">
          Fault drafts
        </Link>
        <span className="text-gray-400">·</span>
        <Link to="/maintenance/fault-rules" className="text-[#4B5563] underline">
          Fault rules
        </Link>
      </div>

      {alertsQuery.isError ? (
        <ListErrorState
          title="Couldn't load fault code alerts"
          status={0}
          message={(alertsQuery.error as Error)?.message}
          onRetry={() => void alertsQuery.refetch()}
        />
      ) : null}

      <div className="relative flex flex-wrap items-end gap-3" data-testid="fault-code-alerts-filters">
        <label className="text-xs text-[#6B7280]">
          Unit
          <EntityPicker
            kind="unit"
            operatingCompanyId={companyId}
            value={filterDraft.unitId || null}
            onChange={(next) =>
              staged.setDraft((d) => ({
                ...d,
                unitId: next ?? "",
                driverId: next ? "" : d.driverId,
              }))
            }
            allowCreate={false}
            placeholder="All units"
            className="mt-1"
            dataTestId="fault-code-alerts-filter-unit"
          />
        </label>
        <label className="text-xs text-[#6B7280]">
          Driver
          <EntityPicker
            kind="driver"
            operatingCompanyId={companyId}
            value={filterDraft.driverId || null}
            onChange={(next) =>
              staged.setDraft((d) => ({
                ...d,
                driverId: next ?? "",
                unitId: next ? "" : d.unitId,
              }))
            }
            allowCreate={false}
            placeholder="All drivers"
            className="mt-1"
            dataTestId="fault-code-alerts-filter-driver"
          />
        </label>
        <Button type="button" size="sm" data-testid="fault-code-alerts-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
          Apply
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="fault-code-alerts-filter-cancel"
          onClick={staged.cancel}
          disabled={!staged.dirty}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="fault-code-alerts-filter-reset"
          onClick={() => {
            staged.cancel();
            setApplied(EMPTY_FILTERS);
            patchListSearchParam(EMPTY_FILTERS);
          }}
        >
          Reset
        </Button>
      </div>

      {deepLinkFaultId ? (
        <p className="text-xs text-[#6B7280]" data-testid="fault-code-alerts-deep-link-banner">
          {deepLinkRow
            ? `Showing alert ${deepLinkRow.fault_code?.trim() || "Fault"} · unit `
            : `Alert not in this result set · `}
          {deepLinkRow ? (
            <EntityLinkOrTombstone kind="unit" id={deepLinkRow.unit_id} name={deepLinkRow.unit_number} noun="Unit" />
          ) : (
            <span>clear filters or wait for E-10 to tick</span>
          )}
        </p>
      ) : null}

      {effectiveUnitId ? (
        <p className="text-xs text-[#6B7280]" data-testid="fault-code-alerts-unit-banner">
          Forward by unit ·{" "}
          <EntityLinkOrTombstone
            kind="unit"
            id={effectiveUnitId}
            name={rows.find((r) => r.unit_id === effectiveUnitId)?.unit_number}
            noun="Unit"
          />
        </p>
      ) : null}
      {effectiveDriverId ? (
        <p className="text-xs text-[#6B7280]" data-testid="fault-code-alerts-driver-banner">
          Reverse by driver-at-the-time ·{" "}
          <EntityLinkOrTombstone
            kind="driver"
            id={effectiveDriverId}
            name={rows.find((r) => r.driver_id === effectiveDriverId)?.driver_label}
            noun="Driver"
          />
        </p>
      ) : null}

      {!alertsQuery.isError ? (
        <ParityTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={alertsQuery.isLoading}
          storageKey="maintenance-fault-code-alerts"
          emptyText={
            effectiveUnitId
              ? "No fault codes for this unit."
              : effectiveDriverId
                ? "No fault codes while this driver held a unit."
                : "No fault code alerts yet — rows arrive when the Samsara fault poll ticks."
          }
          exportFilename="fault-code-alerts"
          rowClassName={(row) =>
            deepLinkFaultId && row.id === deepLinkFaultId ? "bg-[#F7F8FA] ring-1 ring-[#E5E7EB]" : ""
          }
          rowTestId={(row) => `fault-alert-${row.id}`}
        />
      ) : null}
    </div>
  );
}
