import { useCompanyContext } from "../../../contexts/CompanyContext";
import { SafetyMeetingsPage } from "../SafetyMeetingsPage";

export function SafetyMeetingsTab() {
  const { selectedCompanyId } = useCompanyContext();
  return <SafetyMeetingsPage operatingCompanyId={selectedCompanyId ?? ""} />;
}
