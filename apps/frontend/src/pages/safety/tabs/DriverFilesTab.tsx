import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DriverProfilePage } from "../../drivers/DriverProfilePage";
import { DriversListPage } from "../../drivers/DriversListPage";
import { DriverSafetyCards } from "../../../components/safety/DriverSafetyCards";
import { useSafetyUiContext } from "../SafetyLayout";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { getTrainingCompletions } from "../../../api/safety";
import { TrainingTable } from "../components/TrainingTable";
import { ListErrorState } from "../../../components/ListErrorState";
import { ApiError } from "../../../api/client";
import { userFacingApiError } from "../../../lib/api-error-message";
import { Button } from "../../../components/Button";

export function DriverFilesTab() {
  const [driverId, setDriverId] = useState<string | null>(null);
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const trainingPageSize = 25;
  const [trainingPage, setTrainingPage] = useState(1);
  useEffect(() => setTrainingPage(1), [companyId]);
  // DQF connectivity: driver training completions are part of the Driver Qualification File —
  // surface them on the Driver Files landing tab (they were previously only reachable via the
  // unlinked /safety/training/records URL).
  const trainingQuery = useQuery({
    queryKey: ["safety", "training", companyId, trainingPage],
    queryFn: () => getTrainingCompletions(companyId, { limit: trainingPageSize, offset: (trainingPage - 1) * trainingPageSize }),
    enabled: Boolean(companyId),
  });
  const trainingTotal = trainingQuery.isError ? 0 : trainingQuery.data?.total_count ?? 0;
  const trainingPageCount = Math.max(1, Math.ceil(trainingTotal / trainingPageSize));
  // SM3: consume the shared Safety layout UI context so the driver-files landing finally FEEDS the
  // orphaned Activity-window / Status filter + counter bar (previously only the deprecated v5 shell did).
  const { filter, activityWindow, setDriverCounts, clearDriverCounts } = useSafetyUiContext();

  // Clear the reported counts when leaving driver-files so the shared counter bar does not show stale
  // numbers on tabs that do not feed it (no-silent-failure fix for the remaining tabs).
  useEffect(() => {
    return () => clearDriverCounts();
  }, [clearDriverCounts]);

  return (
    <div className="rounded-sm border border-gray-200 bg-white p-4">
      {driverId ? (
        <DriverProfilePage driverId={driverId} onBack={() => setDriverId(null)} />
      ) : (
        <>
          <DriverSafetyCards
            companyId={companyId}
            filter={filter}
            activityWindow={activityWindow}
            onCountsChange={setDriverCounts}
            onOpenProfile={(nextDriverId) => setDriverId(nextDriverId)}
          />
          <DriversListPage onOpenProfile={(nextDriverId) => setDriverId(nextDriverId)} />
          <div className="mt-4 space-y-2" data-testid="driver-files-training-section">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Training Completions</h3>
              <span className="flex flex-wrap gap-3 text-xs">
                <Link to="/safety/training/programs" className="font-semibold text-slate-700 underline">
                  Training Programs
                </Link>
                <Link to="/safety/training/records" className="font-semibold text-slate-700 underline">
                  Training Records
                </Link>
              </span>
            </div>
            {trainingQuery.isError ? (
              <div data-testid="driver-files-training-query-error">
                <ListErrorState
                  title="Couldn't load training completions"
                  status={trainingQuery.error instanceof ApiError ? trainingQuery.error.status : 0}
                  message={userFacingApiError(trainingQuery.error, "Couldn't load training completions.")}
                  onRetry={() => void trainingQuery.refetch()}
                />
              </div>
            ) : (
              <TrainingTable rows={trainingQuery.data?.training_completions ?? []} hidePager />
            )}
            {!trainingQuery.isError && trainingTotal > trainingPageSize ? <div className="flex items-center justify-end gap-2 text-xs" data-testid="driver-files-training-server-pager">
              <Button size="sm" variant="secondary" disabled={trainingPage <= 1 || trainingQuery.isFetching} onClick={() => setTrainingPage((current) => Math.max(1, current - 1))}>Previous training</Button>
              <span className="text-slate-600">Page {trainingPage} of {trainingPageCount} · {trainingTotal} records</span>
              <Button size="sm" variant="secondary" disabled={trainingPage >= trainingPageCount || trainingQuery.isFetching} onClick={() => setTrainingPage((current) => Math.min(trainingPageCount, current + 1))}>Next training</Button>
            </div> : null}
          </div>
        </>
      )}
    </div>
  );
}
