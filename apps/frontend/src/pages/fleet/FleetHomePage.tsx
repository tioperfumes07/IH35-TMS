import { useState } from "react";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { CreateUnitModal } from "../../components/fleet/CreateUnitModal";
import { CreateTrailerModal } from "../../components/fleet/CreateTrailerModal";
import { FleetTablePage } from "../maintenance/FleetTablePage";

/**
 * Canonical FLEET home (/fleet) — the units + trailers roster. Reuses the shared
 * FleetTablePage (same component the Maintenance "Fleet table" sub-tab renders) so
 * there is a single source for the roster; rows click through to /fleet/units/:id.
 * Defaults to active-only here per the blueprint §7.2.2.3 fleet view.
 *
 * Create CTAs (0441-mod9-fleet-roster-no-create-actions): + Create Unit / + Create Trailer
 * open modals wired to POST /api/v1/mdata/units and POST /api/v1/mdata/equipment.
 * Lists fleet catalogs retain their own + Create — additive only, nothing deleted.
 */
export function FleetHomePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [createUnitOpen, setCreateUnitOpen] = useState(false);
  const [createTrailerOpen, setCreateTrailerOpen] = useState(false);

  return (
    <div className="space-y-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">FLEET</h1>
          <p className="text-xs text-gray-500">Trucks, trailers, and company vehicles for the selected operating company.</p>
        </div>
        {companyId ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="fleet-roster-create-actions">
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
        ) : null}
      </div>
      {companyId ? (
        <>
          <FleetTablePage operatingCompanyId={companyId} defaultActiveOnly />
          <CreateUnitModal
            open={createUnitOpen}
            operatingCompanyId={companyId}
            onClose={() => setCreateUnitOpen(false)}
          />
          <CreateTrailerModal
            open={createTrailerOpen}
            operatingCompanyId={companyId}
            onClose={() => setCreateTrailerOpen(false)}
          />
        </>
      ) : (
        <div
          className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700"
          data-testid="fleet-need-company"
        >
          Select an operating company to view the fleet.
        </div>
      )}
    </div>
  );
}
