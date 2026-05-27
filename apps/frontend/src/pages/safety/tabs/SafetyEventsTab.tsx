import { useCompanyContext } from "../../../contexts/CompanyContext";
import { SafetyEventsPage } from "../SafetyEventsPage";

export function SafetyEventsTab() {
  const { selectedCompanyId } = useCompanyContext();
  return <SafetyEventsPage operatingCompanyId={selectedCompanyId ?? ""} />;
}
