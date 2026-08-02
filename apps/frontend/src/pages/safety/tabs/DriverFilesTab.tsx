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

export function DriverFilesTab() {
  const [driverId, setDriverId] = useState<string | null>(null);
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  // DQF connectivity: driver training completions are part of the Driver Qualification File —
  // surface them on the Driver Files landing tab (they were previously only reachable via the
  // unlinked /safety/training/records URL).
  const trainingQuery = useQuery({
    queryKey: ["safety", "training", companyId],
    queryFn: () => getTrainingCompletions(companyId),
    enabled: Boolean(companyId),
  });
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
          <div className="mt-4 space-y-2">
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
            <TrainingTable rows={trainingQuery.data?.training_completions ?? []} />
          </div>
        </>
      )}
    </div>
  );
}
