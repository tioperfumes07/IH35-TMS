/**
 * ARCHIVE (Sunset 2026-09-01): SafetyTabPlaceholder stub — replaced by PermitsPage (A23-13).
 * Kept for route export stability; PermitsTab delegates to live surface.
 */
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { Permits } from "../Permits";

export function PermitsTab() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  return <Permits operatingCompanyId={operatingCompanyId} />;
}
