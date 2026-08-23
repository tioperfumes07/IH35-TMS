import { entityLabel } from "../../lib/entity-label";
import { useQuery } from "@tanstack/react-query";
import { ListErrorState } from "../ListErrorState";
import { getSafetyFines, getInternalFines } from "../../api/safety";
import { EntityLink } from "../shared/EntityLink";

type Props = {
  operatingCompanyId: string;
  driverId: string;
  /** Optional test id for the section root. */
  "data-testid"?: string;
};

/**
 * SAF-F16 — reverse drill-through from a driver to the fines imposed on them.
 *
 * There are TWO fines tables and they are not interchangeable, so this surface reads both or it
 * would under-report by construction:
 *   • safety.civil_fines    — external/government citations, keyed subject_driver_id
 *   • safety.internal_fines — company-imposed discipline, keyed driver_id
 * Both are already filtered SERVER-side (the internal-fines list caps at LIMIT 500, so a
 * client-side filter would silently drop a driver's fines once the company crosses that cap).
 *
 * The driver profile carried a dozen ops views and none for fines, so money being taken off a
 * driver's settlement had no reverse surface on the driver it was taken from.
 */
export function DriverFinesReverseSection({
  operatingCompanyId,
  driverId,
  "data-testid": testId = "driver-fines-reverse-section",
}: Props) {
  const enabled = Boolean(operatingCompanyId) && Boolean(driverId);

  const civilQuery = useQuery({
    queryKey: ["safety-fines", "reverse-driver", operatingCompanyId, driverId],
    queryFn: () => getSafetyFines(operatingCompanyId, { subject_driver_id: driverId }),
    enabled,
  });

  const internalQuery = useQuery({
    queryKey: ["internal-fines", "reverse-driver", operatingCompanyId, driverId],
    queryFn: () => getInternalFines(operatingCompanyId, { driver_id: driverId }),
    enabled,
  });

  const civil = civilQuery.data?.fines ?? [];
  const internal = internalQuery.data?.fines ?? [];
  const isLoading = civilQuery.isLoading || internalQuery.isLoading;
  // Reported per-source: if only one call fails, saying "no fines" would be a lie about the other.
  const civilFailed = civilQuery.isError;
  const internalFailed = internalQuery.isError;
  const total = civil.length + internal.length;

  return (
    <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Fines</h3>
        <EntityLink kind="safety_fines_driver" id={driverId} label="Open Safety" className="text-xs font-semibold text-slate-700 underline" />
      </div>
      <p className="text-sm text-gray-600">
        Civil citations and internal fines linked to this driver.
      </p>

      {isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {civilFailed ? <ListErrorState status={0} message="Failed to load civil fines." onRetry={() => void civilQuery.refetch()} /> : null}
      {internalFailed ? <ListErrorState status={0} message="Failed to load internal fines." onRetry={() => void internalQuery.refetch()} /> : null}
      {!isLoading && !civilFailed && !internalFailed && total === 0 ? (
        <p className="text-sm text-gray-500">No fines linked to this driver.</p>
      ) : null}

      {civil.length > 0 ? (
        <div data-testid="driver-fines-civil">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Civil</h4>
          <ul className="mt-1 space-y-2">
            {civil.map((f: Record<string, unknown>) => {
              const id = String(f.id ?? "");
              const label = entityLabel(f.violation_code ?? f.jurisdiction, id, "Fine");
              return (
                <li key={id} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
                  <EntityLink kind="safety_fine" id={id} label={label} className="font-semibold text-slate-700" />
                  <span className="ml-2 text-gray-600">{String(f.status ?? "")}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {internal.length > 0 ? (
        <div data-testid="driver-fines-internal">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Internal</h4>
          <ul className="mt-1 space-y-2">
            {internal.map((f: Record<string, unknown>) => {
              const id = String(f.id ?? "");
              const label = String(f.reason_name ?? entityLabel(f.reason_code, id, "Internal fine"));
              return (
                <li key={id} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
                  <EntityLink kind="internal_fine" id={id} label={label} className="font-semibold text-slate-700" />
                  <span className="ml-2 text-gray-600">{String(f.status ?? "")}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
