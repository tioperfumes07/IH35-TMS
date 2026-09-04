import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { DriverSafetyProfilePanel } from "../../../components/safety/driver-safety/DriverSafetyProfilePanel";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { getDriverSafetyAggregate } from "../../../api/mdata";
import { ListErrorState } from "../../../components/ListErrorState";
import { ApiError } from "../../../api/client";

export default function DriverSafetyProfilePage() {
  const { driverId = "" } = useParams<{ driverId: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const query = useQuery({
    queryKey: ["driver-safety-profile", companyId, driverId],
    queryFn: () => getDriverSafetyAggregate(driverId, companyId),
    enabled: Boolean(companyId && driverId),
  });

  if (!companyId) return <p className="text-xs text-slate-600">Select an operating company to load this driver safety profile.</p>;
  if (query.isLoading) return <p className="text-xs text-slate-600">Loading driver safety profile…</p>;
  if (query.isError) return <ListErrorState title="Couldn't load driver safety profile" status={query.error instanceof ApiError ? query.error.status : 0} message={(query.error as Error).message} onRetry={() => void query.refetch()} />;
  if (!query.data) return <p className="text-xs text-slate-600">Driver safety profile not found.</p>;

  const { driver, medical_card: medical, training_records: training } = query.data;
  const dqMissingCount = [driver.cdl_number, driver.cdl_expires_at, medical.expiration].filter((value) => !value).length;
  const trainingDueCount = training.filter((record) => record.status === "yellow" || record.status === "red").length;
  const medicalExpiryPill = medical.color_status === "gray" ? "unknown" : medical.color_status;

  return (
    <main className="space-y-4">
      <DriverSafetyProfilePanel
        driverId={driver.id}
        driverName={`${driver.first_name} ${driver.last_name}`.trim()}
        driverCredentialLabel={driver.cdl_number ? `CDL ${driver.cdl_number}` : "CDL not on file"}
        medicalExpiryPill={medicalExpiryPill === "yellow" ? "amber" : medicalExpiryPill}
        dqMissingCount={dqMissingCount}
        trainingDueCount={trainingDueCount}
      />
    </main>
  );
}
