import { useCompanyContext } from "../../../contexts/CompanyContext";
import { DriverQualificationMatrix } from "../components/DriverQualificationMatrix";

/** 443.280: the board replaces the page body. Activity/management lives on its own tab. */
export function DriverFilesTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  return <DriverQualificationMatrix key={companyId} companyId={companyId} />;
}
