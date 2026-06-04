import { useCompanyContext } from "../../../contexts/CompanyContext";
import { CargoClaimsPage } from "../CargoClaimsPage";

export function CargoClaimsTab() {
  const { selectedCompanyId } = useCompanyContext();
  return <CargoClaimsPage operatingCompanyId={selectedCompanyId ?? ""} />;
}
