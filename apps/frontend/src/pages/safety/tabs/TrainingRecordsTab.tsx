import { useCompanyContext } from "../../../contexts/CompanyContext";
import { TrainingRecordsPage } from "../TrainingRecordsPage";

export function TrainingRecordsTab() {
  const { selectedCompanyId } = useCompanyContext();
  return <TrainingRecordsPage operatingCompanyId={selectedCompanyId ?? ""} />;
}
