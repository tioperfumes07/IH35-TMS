/**
 * FLT-F424 / F425 / F426 / F427 — /fleet is a HOME, not a roster.
 * Title "Fleet". Tabs + seven KPI tiles from real columns. FLT-F428 is a warning, not a tile.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { CreateUnitModal } from "../../components/fleet/CreateUnitModal";
import { CreateTrailerModal } from "../../components/fleet/CreateTrailerModal";
import { FleetTablePage } from "../maintenance/FleetTablePage";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { listAllUnits, listEquipment } from "../../api/mdata";
import { listWorkOrders } from "../../api/maintenance";
import { EntityViewModeToggle } from "../../components/EntityViewModeToggle";
import { useViewModePref } from "../../hooks/useViewModePref";
import { MasterDetailShell } from "../../components/layout/MasterDetailShell";
import { MASTER_DETAIL } from "../../design/master-detail";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { KpiCard } from "../../components/layout/KpiCard";
import { KpiStrip } from "../../components/layout/KpiStrip";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { TransfersInProgressPage } from "./TransfersInProgressPage";
import { RosterIntegrityPage } from "./RosterIntegrityPage";
import { FLEET_HOME_TABS, fleetHomeTabHref, parseFleetHomeTab } from "./fleetHomeTabs";
import { apiRequest } from "../../api/client";

type UnitRow = {
  id: string;
  kind?: "truck" | "trailer";
  unit_number?: string;
  status?: string;
  make?: string;
  model?: string;
  vin?: string;
  assigned_driver_id?: string | null;
  current_unit_id?: string | null;
  equipment_type?: string;
  type?: string;
};

const OPEN_WO = new Set(["open", "in_progress", "waiting_parts", "draft"]);

export function FleetHomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeTab = parseFleetHomeTab(searchParams);
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [createUnitOpen, setCreateUnitOpen] = useState(false);
  const [createTrailerOpen, setCreateTrailerOpen] = useState(false);
  const { viewMode, setViewMode } = useViewModePref("units", "master-detail");
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  const fleetQ = useQuery({
    queryKey: ["fleet", "home-kpis", companyId],
    queryFn: async () => {
      const payload = await listAllUnits({
        operating_company_id: companyId,
        include: "trailers",
        include_inactive: true,
      });
      return (payload.units ?? []) as UnitRow[];
    },
    enabled: Boolean(companyId),
  });

  const trailersQ = useQuery({
    queryKey: ["fleet", "home-trailers", companyId],
    queryFn: () => listEquipment({ operating_company_id: companyId, limit: 500 }),
    enabled: Boolean(companyId),
  });

  const woQ = useQuery({
    queryKey: ["fleet", "home-wos", companyId],
    queryFn: () => listWorkOrders(companyId),
    enabled: Boolean(companyId),
  });

  const transfersQ = useQuery({
    queryKey: ["fleet", "home-transfers", companyId],
    queryFn: () => {
      const qs = new URLSearchParams({ operating_company_id: companyId, status: "pending_to_confirm" });
      return apiRequest<{ rows: Array<{ id: string; equipment_number?: string | null }> }>(`/api/v1/equipment-transfers?${qs}`).then((r) => r.rows);
    },
    enabled: Boolean(companyId) && (activeTab === "home" || activeTab === "transfers"),
  });

  const rows = fleetQ.data ?? [];
  const units = rows.filter((r) => r.kind !== "trailer");
  const trailersFromUnits = rows.filter((r) => r.kind === "trailer");
  const trailers = (trailersQ.data?.equipment ?? []).map((t) => ({
    id: t.id,
    kind: "trailer" as const,
    unit_number: t.equipment_number,
    status: typeof t.status === "string" ? t.status : undefined,
    current_unit_id: typeof t.current_unit_id === "string" ? t.current_unit_id : null,
    equipment_type: typeof t.equipment_type === "string" ? t.equipment_type : undefined,
  })) as UnitRow[];
  const trailerRows = trailers.length ? trailers : trailersFromUnits;
  const openWos = (woQ.data?.work_orders ?? []).filter((w) => OPEN_WO.has(String(w.status ?? "").toLowerCase()));

  const kpis = {
    unitsInService: units.filter((u) => u.status === "InService").length,
    unitsMaint: units.filter((u) => u.status === "InMaintenance").length,
    unitsOos: units.filter((u) => u.status === "OutOfService").length,
    unassigned: units.filter((u) => !u.assigned_driver_id).length,
    trailersInService: trailerRows.filter((t) => t.status === "InService").length,
    trailersUnhooked: trailerRows.filter((t) => !t.current_unit_id).length,
    openWos: openWos.length,
  };

  const unitsByStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of units) map.set(u.status ?? "—", (map.get(u.status ?? "—") ?? 0) + 1);
    return [...map.entries()];
  }, [units]);

  const trailersByType = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of trailerRows) {
      const key = String(t.equipment_type ?? t.type ?? "—");
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()];
  }, [trailerRows]);

  const needAttention = units.filter((u) => u.status === "OutOfService" || u.status === "InMaintenance");
  const unassignedUnits = units.filter((u) => !u.assigned_driver_id);
  const unhooked = trailerRows.filter((t) => !t.current_unit_id);

  const unitsMdQ = useQuery({
    queryKey: ["fleet", "units-md", companyId],
    queryFn: async () => {
      const payload = await listAllUnits({
        operating_company_id: companyId,
        include: "trailers",
        status: "InService",
      });
      return (payload.units ?? []) as UnitRow[];
    },
    enabled: Boolean(companyId) && viewMode === "master-detail" && (activeTab === "units" || activeTab === "trailers"),
  });
  const mdUnits = useMemo(() => (unitsMdQ.data ?? []).filter((u) => Boolean(u?.id)), [unitsMdQ.data]);
  const selected = mdUnits.find((u) => u.id === selectedUnitId) ?? mdUnits[0] ?? null;

  return (
    <div className={`${MASTER_DETAIL.pageShellClass} p-3`} data-c55-fleet-view={viewMode} data-testid="fleet-home-page">
      <PageHeader
        title="Fleet"
        subtitle="Trucks, trailers and company vehicles"
        backHref="/home"
        actions={
          companyId ? (
            <div className="flex flex-wrap items-center gap-2" data-testid="fleet-roster-create-actions">
              <EntityViewModeToggle entity="units" value={viewMode} onChange={setViewMode} />
              <Button size="sm" data-testid="fleet-create-unit" onClick={() => setCreateUnitOpen(true)}>
                + Create Unit
              </Button>
              <Button size="sm" variant="secondary" data-testid="fleet-create-trailer" onClick={() => setCreateTrailerOpen(true)}>
                + Create Trailer
              </Button>
            </div>
          ) : undefined
        }
      />

      <NavyPageSubNav
        items={FLEET_HOME_TABS.map((tab) => ({ label: tab.label, to: fleetHomeTabHref(tab.id) }))}
        activeId={activeTab}
        onTabChange={(id) => navigate(fleetHomeTabHref(id as (typeof FLEET_HOME_TABS)[number]["id"]))}
        itemIds={[...FLEET_HOME_TABS.map((t) => t.id)]}
      />

      <div data-testid="fleet-home-kpi-strip">
        <KpiStrip>
          <KpiCard label="Units in service" number={String(kpis.unitsInService)} to="/fleet?tab=units&status=InService" />
          <KpiCard label="In maintenance" number={String(kpis.unitsMaint)} to="/fleet?tab=units&status=InMaintenance" />
          <KpiCard label="Out of service" number={String(kpis.unitsOos)} to="/fleet?tab=units&status=OutOfService" />
          <KpiCard label="Unassigned" number={String(kpis.unassigned)} to="/fleet?tab=units&unassigned=1" />
          <KpiCard label="Trailers in service" number={String(kpis.trailersInService)} to="/fleet?tab=trailers&status=InService" />
          <KpiCard label="Trailers unhooked" number={String(kpis.trailersUnhooked)} to="/fleet?tab=trailers&unhooked=1" />
          <KpiCard label="Open work orders" number={String(kpis.openWos)} to="/fleet?tab=maintenance" />
        </KpiStrip>
      </div>

      {activeTab === "home" ? (
        <div className="mt-3 space-y-3" data-testid="fleet-home-board">
          <div className="rounded-sm border border-amber-300 bg-amber-50 p-3 text-[12px] text-[#0F1219]" data-testid="fleet-f428-expiry-gap">
            Registration, inspection and insurance expiry are not on the unit or trailer record. Drivers carry six expiry dates; trucks carry none. This is a real roadside hole — it needs its own migration and its own round. It is not invented here.
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <section className={`${MASTER_DETAIL.surfaceClass} p-3`}>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#4B5563]">Needs attention</h2>
              {needAttention.length === 0 ? <p className="text-xs text-[#6B7280]">No unit is out of service or in maintenance.</p> : (
                <ul className="text-xs">
                  {needAttention.slice(0, 8).map((u) => (
                    <li key={u.id}><EntityLink kind="unit" id={u.id} label={u.unit_number || "Unit"} /> · {u.status}</li>
                  ))}
                </ul>
              )}
            </section>
            <section className={`${MASTER_DETAIL.surfaceClass} p-3`}>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#4B5563]">Unassigned units</h2>
              {unassignedUnits.length === 0 ? <p className="text-xs text-[#6B7280]">Every in-scope unit has a driver.</p> : (
                <ul className="text-xs">
                  {unassignedUnits.slice(0, 8).map((u) => (
                    <li key={u.id}><EntityLink kind="unit" id={u.id} label={u.unit_number || "Unit"} /></li>
                  ))}
                </ul>
              )}
            </section>
            <section className={`${MASTER_DETAIL.surfaceClass} p-3`}>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#4B5563]">Trailers not hooked</h2>
              {unhooked.length === 0 ? <p className="text-xs text-[#6B7280]">Every trailer is hooked.</p> : (
                <ul className="text-xs">
                  {unhooked.slice(0, 8).map((t) => (
                    <li key={t.id}><EntityLink kind="trailer" id={t.id} label={t.unit_number || "Trailer"} /></li>
                  ))}
                </ul>
              )}
            </section>
            <section className={`${MASTER_DETAIL.surfaceClass} p-3`}>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#4B5563]">Units by status</h2>
              <ul className="text-xs">
                {unitsByStatus.map(([status, n]) => (
                  <li key={status}>{status} · {n}</li>
                ))}
              </ul>
            </section>
            <section className={`${MASTER_DETAIL.surfaceClass} p-3`}>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#4B5563]">Trailers by type</h2>
              <ul className="text-xs">
                {trailersByType.map(([type, n]) => (
                  <li key={type}>{type} · {n}</li>
                ))}
              </ul>
            </section>
            <section className={`${MASTER_DETAIL.surfaceClass} p-3`}>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#4B5563]">Transfers in progress</h2>
              {(transfersQ.data ?? []).length === 0 ? <p className="text-xs text-[#6B7280]">No transfer waiting on both drivers.</p> : (
                <ul className="text-xs">
                  {(transfersQ.data ?? []).slice(0, 8).map((row) => (
                    <li key={row.id}>{row.equipment_number || row.id}</li>
                  ))}
                </ul>
              )}
              <Link className="mt-2 inline-block text-xs font-semibold text-slate-700 hover:underline" to="/fleet?tab=transfers">Open transfers</Link>
            </section>
          </div>
        </div>
      ) : null}

      {activeTab === "units" || activeTab === "trailers" ? (
        companyId ? (
          viewMode === "list" ? (
            <FleetTablePage operatingCompanyId={companyId} defaultActiveOnly />
          ) : (
            <div className="min-h-0 flex-1" data-testid="fleet-master-detail-shell">
              {unitsMdQ.isError ? <ListErrorBanner onRetry={() => void unitsMdQ.refetch()} /> : null}
              <MasterDetailShell
                testId="fleet-units-master-detail-shell"
                master={
                  <aside className={`${MASTER_DETAIL.masterPaneClass} ${MASTER_DETAIL.surfaceClass} p-2`} data-master-detail-master="true" data-c55-fleet-master="1">
                    <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-[#4B5563]">
                      {activeTab === "trailers" ? "Trailers" : "Units"} ({mdUnits.length})
                    </p>
                    <div className={MASTER_DETAIL.listScrollClass}>
                      {mdUnits.map((unit) => {
                        const active = (selected?.id ?? null) === unit.id;
                        return (
                          <button
                            key={unit.id}
                            type="button"
                            className={`mb-1 w-full rounded-sm border px-2 py-1.5 text-left text-xs ${
                              active ? MASTER_DETAIL.rowSelectedClass : `border-transparent ${MASTER_DETAIL.rowHoverClass}`
                            }`}
                            onClick={() => setSelectedUnitId(unit.id)}
                          >
                            <span className="font-semibold text-[#0F1219]">{unit.unit_number || "Unit"}</span>
                            <span className="mt-0.5 block text-center text-[#6B7280]">
                              {unit.status ?? "—"}
                              {unit.make || unit.model ? ` · ${[unit.make, unit.model].filter(Boolean).join(" ")}` : ""}
                            </span>
                          </button>
                        );
                      })}
                      {mdUnits.length === 0 && !unitsMdQ.isLoading ? (
                        <p className="px-1 text-xs text-[#6B7280]">No in-service units for this company.</p>
                      ) : null}
                    </div>
                  </aside>
                }
                detail={
                  selected ? (
                    <div className={`${MASTER_DETAIL.surfaceClass} space-y-3 p-3 text-xs`} data-c55-fleet-detail="1">
                      <p className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">Unit profile</p>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                        <dt className="text-[#6B7280]">Unit</dt>
                        <dd className="text-center font-medium text-[#0F1219]">
                          <EntityLink
                            kind={selected.kind === "trailer" ? "trailer" : "unit"}
                            id={selected.id}
                            label={selected.unit_number || "Unit"}
                          />
                        </dd>
                        <dt className="text-[#6B7280]">Status</dt>
                        <dd className="text-center text-[#0F1219]">{selected.status ?? "—"}</dd>
                        <dt className="text-[#6B7280]">Make / model</dt>
                        <dd className="text-center text-[#0F1219]">
                          {[selected.make, selected.model].filter(Boolean).join(" ") || "—"}
                        </dd>
                        <dt className="text-[#6B7280]">VIN</dt>
                        <dd className="text-center text-[#0F1219]">{selected.vin ?? "—"}</dd>
                      </dl>
                      <Button
                        size="sm"
                        onClick={() =>
                          navigate(
                            selected.kind === "trailer"
                              ? `/fleet/trailers/${selected.id}`
                              : `/fleet/units/${selected.id}`,
                          )
                        }
                      >
                        Open full {selected.kind === "trailer" ? "trailer" : "unit"} profile
                      </Button>
                    </div>
                  ) : (
                    <div className={`${MASTER_DETAIL.surfaceClass} p-3 text-xs text-[#6B7280]`}>
                      Select a unit to preview.
                    </div>
                  )
                }
              />
            </div>
          )
        ) : (
          <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-700" data-testid="fleet-need-company">
            Select an operating company to view the fleet.
          </div>
        )
      ) : null}

      {activeTab === "transfers" ? <TransfersInProgressPage /> : null}
      {activeTab === "roster_integrity" ? <RosterIntegrityPage /> : null}
      {activeTab === "maintenance" ? (
        <section className={`${MASTER_DETAIL.surfaceClass} mt-3 p-3`} data-testid="fleet-home-maintenance">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#4B5563]">Open work orders</h2>
          {openWos.length === 0 ? <p className="text-xs text-[#6B7280]">No open work order.</p> : (
            <ul className="text-xs">
              {openWos.slice(0, 25).map((wo) => (
                <li key={String(wo.id)}>
                  <EntityLink kind="work_order" id={String(wo.id)} label={String(wo.display_id ?? wo.id)} />
                  {" · "}
                  {String(wo.status ?? "—")}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {companyId ? (
        <>
          <CreateUnitModal
            open={createUnitOpen}
            operatingCompanyId={companyId}
            onClose={() => setCreateUnitOpen(false)}
            onCreated={(unitId) => navigate(`/fleet/units/${unitId}`)}
          />
          <CreateTrailerModal
            open={createTrailerOpen}
            operatingCompanyId={companyId}
            onClose={() => setCreateTrailerOpen(false)}
            onCreated={(trailerId) => navigate(`/fleet/trailers/${trailerId}`)}
          />
        </>
      ) : null}
    </div>
  );
}
