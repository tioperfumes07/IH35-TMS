import { ClaimsTab } from "../../insurance/ClaimsTab";
import { LawsuitsTab } from "../../insurance/LawsuitsTab";
import { useCompanyContext } from "../../../contexts/CompanyContext";

export function InsuranceTab() {
  const { selectedCompanyId } = useCompanyContext();
  return (
    <div className="space-y-3">
      <ClaimsTab operatingCompanyId={selectedCompanyId ?? undefined} />
      <LawsuitsTab operatingCompanyId={selectedCompanyId ?? undefined} />
    </div>
  );
}
