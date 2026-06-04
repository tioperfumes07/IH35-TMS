import { useCompanyContext } from "../../../contexts/CompanyContext";
import { IdvrPage } from "../IdvrPage";

export function IDVRTab() {
  const { selectedCompanyId } = useCompanyContext();
  return <IdvrPage operatingCompanyId={selectedCompanyId ?? ""} />;
}
