import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { CreateUnitModal } from "../../components/fleet/CreateUnitModal";
import { CreateTrailerModal } from "../../components/fleet/CreateTrailerModal";
import { FleetTablePage } from "../maintenance/FleetTablePage";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { listAllUnits, listEquipment } from "../../api/mdata";
import { listWorkOrdersFiltered } from "../../api/maintenance";
import { EntityViewModeToggle } from "../../components/EntityViewModeToggle";
import { useViewModePref } from "../../hooks/useViewModePref";
import { MasterDetailShell } from "../../components/layout/MasterDetailShell";
import { MASTER_DETAIL } from "../../design/master-detail";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { KpiCard } from "../../components/layout/KpiCard";
import { KpiStrip } from "../../components/layout/KpiStrip";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { colors } from "../../design/tokens";

/**
 * PR3 — Fleet module HOME (owner 2026-10-05).
 * Title sentence-case "Fleet". KPI strip + tab strip + attention. Roster is a tab, not the landing page.
 * FLT-F428: no registration/inspection/insurance expiry columns on units/equipment — banner only, no invented tile.
 */

export const FLEET_HOME_TABS = [
  { id: "home", label: "Home", to: "/fleet" },
  { id: "units", label: "Units", to: "/fleet?tab=units" },
  { id: "trailers", label: "Trailers", to: "/fleet?tab=trailers" },
  { id: "transfers", label: "Transfers", to: "/fleet/transfers-in-progress" },
  { id: "roster", label: "Roster integrity", to: "/fleet/roster-integrity" },
  { id: "maintenance", label: "Maintenance", to: "/maintenance" },
] as const;

export type FleetHomeTabId = (typeof FLEET_HOME_TABS)[number]["id"];

export function parseFleetHomeTab(raw: string | null | undefined): FleetHomeTabId {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "units" || v === "trailers") return v;
  return "home";
}

type UnitRow = {
  id: string;
  kind?: "truck" | "trailer";
  unit_number?: string;
  status?: string;
  make?: string;
  model?: string;
  vin?: string;
  assigned_driver_id?: string | null;
};

type EquipRow = {
  id: string;
  status?: string | null;
  current_unit_id?: string | null;
  unit_number?: string | null;
  equipment_number?: string | null;
};

function dashCount(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return String(n);
}

export function FleetHomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tab = parseFleetHomeTab(searchParams.get("tab"));
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [createUnitOpen, setCreateUnitOpen] = useState(false);
  const [createTrailerOpen, setCreateTrailerOpen] = useState(false);
  const { viewMode, setViewMode } = useViewModePref("units", "master-detail");
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  const unitsQuery = useQuery({
    queryKey: ["fleet", "home-units", companyId],
    queryFn: async () => {
      const payload = await listAllUnits({
        operating_company_id: companyId,
        include_inactive: true,
      });
      return (payload.units ?? []) as UnitRow[];
    },
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });

  const trailersQuery = useQuery({
    queryKey: ["fleet", "home-trailers", companyId],
    queryFn: async () => {
      const page = await listEquipment({ operating_company_id: companyId, limit: 500, offset: 0 });
      return (page.equipment ?? []) as EquipRow[];
    },
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });

  const openWoQuery = useQuery({
    queryKey: ["fleet", "home-open-wo", companyId],
    queryFn: () => listWorkOrdersFiltered(companyId, { status: "open" }),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });

  const units = useMemo(() => (unitsQuery.data ?? []).filter((u) => Boolean(u?.id)), [unitsQuery.data]);
  const trailers = useMemo(() => (trailersQuery.data ?? []).filter((t) => Boolean(t?.id)), [trailersQuery.data]);

  const kpi = useMemo(() => {
    const inService = units.filter((u) => u.status === "InService").length;
    const inMaint = units.filter((u) => u.status === "InMaintenance").length;
    const oos = units.filter((u) => u.status === "OutOfService").length;
    const unassigned = units.filter((u) => u.status === "InService" && !u.assigned_driver_id).length;
    const trailersInService = trailers.filter((t) => String(t.status ?? "") === "InService").length;
    const trailersUnhooked = trailers.filter((t) => !t.current_unit_id).length;
    const openWo =
      openWoQuery.data?.total_count ??
      openWoQuery.data?.work_orders?.length ??
      null;
    return { inService, inMaint, oos, unassigned, trailersInService, trailersUnhooked, openWo };
  }, [units, trailers, openWoQuery.data]);

  const mdUnits = useMemo(() => units.filter((u) => u.status === "InService"), [units]);
  const selected = mdUnits.find((u) => u.id === selectedUnitId) ?? mdUnits[0] ?? null;

  const needsAttention = useMemo(
    () =>
      units.filter((u) => u.status === "OutOfService" || u.status === "InMaintenance").slice(0, 8),
    [units]
  );
  const unassignedList = useMemo(
    () => units.filter((u) => u.status === "InService" && !u.assigned_driver_id).slice(0, 8),
    [units]
  );
  const unhookedList = useMemo(() => trailers.filter((t) => !t.current_unit_id).slice(0, 8), [trailers]);

  return (
    <div className={`${MASTER_DETAIL.pageShellClass} p-3`} data-testid="fleet-home-page" data-module-home="fleet">
      <PageHeader
        title="Fleet"
        subtitle="Trucks, trailers, and what needs attention."
        backHref="/home"
        actions={
          companyId ? (
            <div className="flex flex-wrap items-center gap-2" data-testid="fleet-roster-create-actions">
              {(tab === "units" || tab === "trailers") && (
                <EntityViewModeToggle entity="units" value={viewMode} onChange={setViewMode} />
              )}
              <Button size="sm" data-testid="fleet-create-unit" onClick={() => setCreateUnitOpen(true)}>
                + Create Unit
              </Button>
              <Button
                size="sm"
                variant="secondary"
                data-testid="fleet-create-trailer"
                onClick={() => setCreateTrailerOpen(true)}
              >
                + Create Trailer
              </Button>
            </div>
          ) : undefined
        }
      />

      {!companyId ? (
        <div
          className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-700"
          data-testid="fleet-need-company"
        >
          Select an operating company to view the fleet.
        </div>
      ) : (
        <>
          <div data-testid="fleet-kpi-strip">
            <KpiStrip>
              <KpiCard
                label="Units in service"
                number={dashCount(kpi.inService)}
                accent={colors.success}
                to="/fleet?tab=units"
              />
              <KpiCard
                label="In maintenance"
                number={dashCount(kpi.inMaint)}
                accent={colors.warn.strong}
                to="/fleet?tab=units"
              />
              <KpiCard
                label="Out of service"
                number={dashCount(kpi.oos)}
                accent={colors.crit.strong}
                to="/fleet?tab=units"
              />
              <KpiCard
                label="Unassigned"
                number={dashCount(kpi.unassigned)}
                accent={colors.info.strong}
                to="/fleet?tab=units"
              />
              <KpiCard
                label="Trailers in service"
                number={dashCount(kpi.trailersInService)}
                accent={colors.success}
                to="/fleet?tab=trailers"
              />
              <KpiCard
                label="Trailers unhooked"
                number={dashCount(kpi.trailersUnhooked)}
                accent={colors.warn.strong}
                to="/fleet?tab=trailers"
              />
              <KpiCard
                label="Open work orders"
                number={openWoQuery.isError ? "—" : dashCount(kpi.openWo)}
                accent={colors.actionNavy}
                to="/maintenance"
              />
            </KpiStrip>
          </div>

          <div data-testid="fleet-module-tabs">
            <NavyPageSubNav items={FLEET_HOME_TABS.map((t) => ({ label: t.label, to: t.to }))} />
          </div>

          {/* FLT-F428 — gap reported, not designed around. No invented expiry tile. */}
          <div
            className="mt-2 rounded-sm border border-[#FCD34D] bg-[#FFFBEB] px-3 py-2 text-xs text-[#92400E]"
            data-testid="fleet-flt-f428-banner"
            role="status"
          >
            Registration, inspection, and insurance expiry are not on unit or trailer records yet
            (FLT-F428). Drivers carry those dates; trucks do not. No tile is shown for a column that
            does not exist — that needs its own migration and round.
          </div>

          {tab === "home" ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="fleet-home-attention">
              <AttentionCard
                title="Needs attention"
                empty="No units out of service or in maintenance."
                rows={needsAttention.map((u) => ({
                  id: u.id,
                  label: u.unit_number || "Unit",
                  meta: u.status ?? "—",
                  href: `/fleet/units/${u.id}`,
                }))}
              />
              <AttentionCard
                title="Unassigned units"
                empty="Every in-service unit has a driver."
                rows={unassignedList.map((u) => ({
                  id: u.id,
                  label: u.unit_number || "Unit",
                  meta: "No driver",
                  href: `/fleet/units/${u.id}`,
                }))}
              />
              <AttentionCard
                title="Trailers not hooked"
                empty="Every trailer is hooked to a unit."
                rows={unhookedList.map((t) => ({
                  id: t.id,
                  label: t.equipment_number || t.unit_number || "Trailer",
                  meta: "Unhooked",
                  href: `/fleet/trailers/${t.id}`,
                }))}
              />
            </div>
          ) : null}

          {tab === "units" || tab === "trailers" ? (
            <div className="mt-3 min-h-0 flex-1" data-testid={`fleet-tab-${tab}`}>
              {viewMode === "list" ? (
                <FleetTablePage operatingCompanyId={companyId} defaultActiveOnly />
              ) : (
                <div className="min-h-0 flex-1" data-testid="fleet-master-detail-shell">
                  {unitsQuery.isError ? <ListErrorBanner onRetry={() => void unitsQuery.refetch()} /> : null}
                  <MasterDetailShell
                    testId="fleet-units-master-detail-shell"
                    master={
                      <aside
                        className={`${MASTER_DETAIL.masterPaneClass} ${MASTER_DETAIL.surfaceClass} p-2`}
                        data-master-detail-master="true"
                        data-c55-fleet-master="1"
                      >
                        <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-[#4B5563]">
                          {tab === "trailers" ? `Trailers (${trailers.length})` : `Units (${mdUnits.length})`}
                        </p>
                        <div className={MASTER_DETAIL.listScrollClass}>
                          {(tab === "trailers" ? trailers : mdUnits).map((row) => {
                            const id = row.id;
                            const active = (selected?.id ?? null) === id;
                            const label =
                              tab === "trailers"
                                ? (row as EquipRow).equipment_number ||
                                  (row as EquipRow).unit_number ||
                                  "Trailer"
                                : (row as UnitRow).unit_number || "Unit";
                            const status = row.status ?? "—";
                            return (
                              <button
                                key={id}
                                type="button"
                                className={`mb-1 w-full rounded-sm border px-2 py-1.5 text-left text-xs ${
                                  active
                                    ? MASTER_DETAIL.rowSelectedClass
                                    : `border-transparent ${MASTER_DETAIL.rowHoverClass}`
                                }`}
                                onClick={() => {
                                  if (tab === "trailers") {
                                    navigate(`/fleet/trailers/${id}`);
                                    return;
                                  }
                                  setSelectedUnitId(id);
                                }}
                              >
                                <span className="font-semibold text-[#0F1219]">{label}</span>
                                <span className="mt-0.5 block text-center text-[#6B7280]">{status}</span>
                              </button>
                            );
                          })}
                          {(tab === "trailers" ? trailers : mdUnits).length === 0 &&
                          !unitsQuery.isLoading &&
                          !trailersQuery.isLoading ? (
                            <p className="px-1 text-xs text-[#6B7280]">
                              {tab === "trailers" ? "No trailers for this company." : "No in-service units for this company."}
                            </p>
                          ) : null}
                        </div>
                      </aside>
                    }
                    detail={
                      tab === "trailers" ? (
                        <div className={`${MASTER_DETAIL.surfaceClass} p-3 text-xs text-[#6B7280]`}>
                          Select a trailer to open its profile.
                        </div>
                      ) : selected ? (
                        <div className={`${MASTER_DETAIL.surfaceClass} space-y-3 p-3 text-xs`} data-c55-fleet-detail="1">
                          <p className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">Unit profile</p>
                          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                            <dt className="text-[#6B7280]">Unit</dt>
                            <dd className="text-center font-medium text-[#0F1219]">
                              <EntityLink kind="unit" id={selected.id} label={selected.unit_number || "Unit"} />
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
                          <Button size="sm" onClick={() => navigate(`/fleet/units/${selected.id}`)}>
                            Open full unit profile
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
              )}
            </div>
          ) : null}

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
      )}
    </div>
  );
}

function AttentionCard({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{ id: string; label: string; meta: string; href: string }>;
}) {
  return (
    <section className="rounded-sm border border-[#E5E7EB] bg-white p-3" data-testid="fleet-attention-card">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#4B5563]">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-xs text-[#6B7280]">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                to={r.href}
                className="flex items-center justify-between rounded-sm px-1 py-1 text-xs text-[#0F1219] hover:bg-[#F7F8FA]"
              >
                <span className="font-medium">{r.label}</span>
                <span className="text-[#6B7280]">{r.meta}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
