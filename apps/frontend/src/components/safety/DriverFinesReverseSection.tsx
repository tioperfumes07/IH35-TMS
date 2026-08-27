import { entityLabel } from "../../lib/entity-label";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListErrorState } from "../ListErrorState";
import { getSafetyFines, getInternalFines } from "../../api/safety";
import { EntityLink } from "../shared/EntityLink";
import { Button } from "../Button";

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
  const civilPageSize = 25;
  const [civilPage, setCivilPage] = useState(1);
  const internalPageSize = 25;
  const [internalPage, setInternalPage] = useState(1);
  useEffect(() => {
    setCivilPage(1);
    setInternalPage(1);
  }, [operatingCompanyId, driverId]);

  const civilQuery = useQuery({
    queryKey: ["safety-fines", "reverse-driver", operatingCompanyId, driverId, civilPage],
    queryFn: () => getSafetyFines(operatingCompanyId, {
      subject_driver_id: driverId,
      limit: civilPageSize,
      offset: (civilPage - 1) * civilPageSize,
    }),
    enabled,
  });

  const internalQuery = useQuery({
    queryKey: ["internal-fines", "reverse-driver", operatingCompanyId, driverId, internalPage],
    queryFn: () => getInternalFines(operatingCompanyId, {
      driver_id: driverId,
      limit: internalPageSize,
      offset: (internalPage - 1) * internalPageSize,
    }),
    enabled,
  });

  const civil = civilQuery.data?.fines ?? [];
  const civilTotal = civilQuery.isError ? 0 : civilQuery.data?.total_count ?? 0;
  const civilPageCount = Math.max(1, Math.ceil(civilTotal / civilPageSize));
  const internal = internalQuery.data?.fines ?? [];
  const internalTotal = internalQuery.isError ? 0 : internalQuery.data?.total_count ?? 0;
  const internalPageCount = Math.max(1, Math.ceil(internalTotal / internalPageSize));
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
      {!civilQuery.isError && civilTotal > civilPageSize ? (
        <div className="flex items-center justify-end gap-2 text-xs" data-testid="driver-fines-civil-server-pager">
          <Button size="sm" variant="secondary" disabled={civilPage <= 1 || civilQuery.isFetching} onClick={() => setCivilPage((current) => Math.max(1, current - 1))}>Previous civil fines</Button>
          <span className="text-slate-600">Page {civilPage} of {civilPageCount} · {civilTotal} civil fines</span>
          <Button size="sm" variant="secondary" disabled={civilPage >= civilPageCount || civilQuery.isFetching} onClick={() => setCivilPage((current) => Math.min(civilPageCount, current + 1))}>Next civil fines</Button>
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
      {!internalQuery.isError && internalTotal > internalPageSize ? (
        <div className="flex items-center justify-end gap-2 text-xs" data-testid="driver-fines-internal-server-pager">
          <Button size="sm" variant="secondary" disabled={internalPage <= 1 || internalQuery.isFetching} onClick={() => setInternalPage((current) => Math.max(1, current - 1))}>Previous internal fines</Button>
          <span className="text-slate-600">Page {internalPage} of {internalPageCount} · {internalTotal} internal fines</span>
          <Button size="sm" variant="secondary" disabled={internalPage >= internalPageCount || internalQuery.isFetching} onClick={() => setInternalPage((current) => Math.min(internalPageCount, current + 1))}>Next internal fines</Button>
        </div>
      ) : null}
    </div>
  );
}
