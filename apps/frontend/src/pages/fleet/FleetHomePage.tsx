import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { CreateUnitModal } from "../../components/fleet/CreateUnitModal";
import { CreateTrailerModal } from "../../components/fleet/CreateTrailerModal";
import { FleetTablePage } from "../maintenance/FleetTablePage";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { useNavigate } from "react-router-dom";
import { listAllUnits } from "../../api/mdata";
import { EntityViewModeToggle } from "../../components/EntityViewModeToggle";
import { useViewModePref } from "../../hooks/useViewModePref";
import { MasterDetailShell } from "../../components/layout/MasterDetailShell";
import { MASTER_DETAIL } from "../../design/master-detail";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";

/**
 * Canonical FLEET home (/fleet) — the units + trailers roster. Reuses the shared
 * FleetTablePage (same component the Maintenance "Fleet table" sub-tab renders) so
 * there is a single source for the roster; rows click through to /fleet/units/:id.
 * Defaults to active-only here per the blueprint §7.2.2.3 fleet view.
 *
 * C-55 — Regular (full table) + Master-detail toggle, same house control as Customers/Vendors/Drivers.
 */
export function FleetHomePage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [createUnitOpen, setCreateUnitOpen] = useState(false);
  const [createTrailerOpen, setCreateTrailerOpen] = useState(false);
  const { viewMode, setViewMode } = useViewModePref("units", "master-detail");
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  const unitsQuery = useQuery({
    queryKey: ["fleet", "units-md", companyId],
    queryFn: async () => {
      const payload = await listAllUnits({
        operating_company_id: companyId,
        include: "trailers",
        status: "InService",
      });
      return (payload.units ?? []) as Array<{
        id: string;
        kind?: "truck" | "trailer";
        unit_number?: string;
        status?: string;
        make?: string;
        model?: string;
        vin?: string;
      }>;
    },
    enabled: Boolean(companyId) && viewMode === "master-detail",
  });

  const units = useMemo(() => (unitsQuery.data ?? []).filter((u) => Boolean(u?.id)), [unitsQuery.data]);

  const selected = units.find((u) => u.id === selectedUnitId) ?? units[0] ?? null;

  return (
    <div className={`${MASTER_DETAIL.pageShellClass} p-3`} data-c55-fleet-view={viewMode}>
      <PageHeader
        title="FLEET"
        subtitle="Trucks, trailers, and company vehicles for the selected operating company."
        backHref="/home"
        actions={
          companyId ? (
            <div className="flex flex-wrap items-center gap-2" data-testid="fleet-roster-create-actions">
              <EntityViewModeToggle entity="units" value={viewMode} onChange={setViewMode} />
              <Button
                size="sm"
                data-testid="fleet-create-unit"
                onClick={() => setCreateUnitOpen(true)}
              >
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
      {companyId ? (
        <>
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
                      Units ({units.length})
                    </p>
                    <div className={MASTER_DETAIL.listScrollClass}>
                      {units.map((unit) => {
                        const active = (selected?.id ?? null) === unit.id;
                        return (
                          <button
                            key={unit.id}
                            type="button"
                            className={`mb-1 w-full rounded-sm border px-2 py-1.5 text-left text-xs ${
                              active
                                ? MASTER_DETAIL.rowSelectedClass
                                : `border-transparent ${MASTER_DETAIL.rowHoverClass}`
                            }`}
                            onClick={() => setSelectedUnitId(unit.id)}
                          >
                            <span className="font-semibold text-[#0F1219]">{unit.unit_number || "Unit"}</span>
                            <span className="mt-0.5 block text-center text-[#6B7280]">
                              {unit.status ?? "—"}
                              {unit.make || unit.model
                                ? ` · ${[unit.make, unit.model].filter(Boolean).join(" ")}`
                                : ""}
                            </span>
                          </button>
                        );
                      })}
                      {units.length === 0 && !unitsQuery.isLoading ? (
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
          )}
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
      ) : (
        <div
          className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-700"
          data-testid="fleet-need-company"
        >
          Select an operating company to view the fleet.
        </div>
      )}
    </div>
  );
}
