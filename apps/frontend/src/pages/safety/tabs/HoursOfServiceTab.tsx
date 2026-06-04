import { useCompanyContext } from "../../../contexts/CompanyContext";
import { HoursOfServicePage } from "../HoursOfServicePage";

export function HoursOfServiceTab() {
  const { selectedCompanyId } = useCompanyContext();
  return <HoursOfServicePage operatingCompanyId={selectedCompanyId ?? ""} />;
}
