import { useEffect, useState } from "react";
import { DriverProfilePage } from "../../drivers/DriverProfilePage";
import { DriversListPage } from "../../drivers/DriversListPage";
import { DriverSafetyCards } from "../../../components/safety/DriverSafetyCards";
import { useSafetyUiContext } from "../SafetyLayout";
import { useCompanyContext } from "../../../contexts/CompanyContext";

export function DriverFilesTab() {
  const [driverId, setDriverId] = useState<string | null>(null);
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
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
        </>
      )}
    </div>
  );
}
