import { useCompanyContext } from "../../../contexts/CompanyContext";
import { SafetySettingsPage } from "../SafetySettingsPage";

export function SettingsTab() {
  const { selectedCompanyId } = useCompanyContext();
  return <SafetySettingsPage operatingCompanyId={selectedCompanyId ?? ""} />;
}
