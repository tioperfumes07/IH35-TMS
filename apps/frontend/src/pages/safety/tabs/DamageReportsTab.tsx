import { useCompanyContext } from "../../../contexts/CompanyContext";
import { DamageReportsPage } from "../DamageReportsPage";

export function DamageReportsTab() {
  const { selectedCompanyId } = useCompanyContext();
  return <DamageReportsPage operatingCompanyId={selectedCompanyId ?? ""} />;
}
