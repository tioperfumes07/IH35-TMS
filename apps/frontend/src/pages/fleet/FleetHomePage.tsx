import { useCompanyContext } from "../../contexts/CompanyContext";
import { FleetTablePage } from "../maintenance/FleetTablePage";

/**
 * Canonical FLEET home (/fleet) — the units + trailers roster. Reuses the shared
 * FleetTablePage (same component the Maintenance "Fleet table" sub-tab renders) so
 * there is a single source for the roster; rows click through to /fleet/units/:id.
 * Defaults to active-only here per the blueprint §7.2.2.3 fleet view.
 */
export function FleetHomePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  return (
    <div className="space-y-3 p-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">FLEET</h1>
        <p className="text-xs text-gray-500">Trucks, trailers, and company vehicles for the selected operating company.</p>
      </div>
      {companyId ? (
        <FleetTablePage operatingCompanyId={companyId} defaultActiveOnly />
      ) : (
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
          Select an operating company to view the fleet.
        </div>
      )}
    </div>
  );
}
