import { useCompanyContext } from "../../../contexts/CompanyContext";
import { AccidentsPage } from "../AccidentsPage";

export function AccidentsIncidentsTab() {
  const { selectedCompanyId } = useCompanyContext();
  return <AccidentsPage operatingCompanyId={selectedCompanyId ?? ""} />;
}
