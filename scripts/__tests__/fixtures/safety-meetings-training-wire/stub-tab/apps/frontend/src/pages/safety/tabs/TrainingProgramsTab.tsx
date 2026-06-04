import { useCompanyContext } from "../../../contexts/CompanyContext";
import { TrainingProgramsPage } from "../TrainingProgramsPage";

export function TrainingProgramsTab() {
  const { selectedCompanyId } = useCompanyContext();
  return <TrainingProgramsPage operatingCompanyId={selectedCompanyId ?? ""} />;
}

export default TrainingProgramsTab;
