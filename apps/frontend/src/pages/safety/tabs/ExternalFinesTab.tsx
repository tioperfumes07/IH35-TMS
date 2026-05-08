import { useCompanyContext } from "../../../contexts/CompanyContext";
import { FinesPage } from "../FinesPage";

export function ExternalFinesTab() {
  const { selectedCompanyId } = useCompanyContext();
  return <FinesPage operatingCompanyId={selectedCompanyId ?? ""} />;
}
