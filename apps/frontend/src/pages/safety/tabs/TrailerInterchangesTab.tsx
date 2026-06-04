import { useCompanyContext } from "../../../contexts/CompanyContext";
import { TrailerInterchangesPage } from "../TrailerInterchangesPage";

export function TrailerInterchangesTab() {
  const { selectedCompanyId } = useCompanyContext();
  return <TrailerInterchangesPage operatingCompanyId={selectedCompanyId ?? ""} />;
}
