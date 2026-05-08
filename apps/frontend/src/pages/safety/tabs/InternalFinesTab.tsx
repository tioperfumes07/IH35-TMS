import { useCompanyContext } from "../../../contexts/CompanyContext";
import { InternalFinesPage } from "../InternalFinesPage";

export function InternalFinesTab() {
  const { selectedCompanyId } = useCompanyContext();
  return <InternalFinesPage operatingCompanyId={selectedCompanyId ?? ""} />;
}
