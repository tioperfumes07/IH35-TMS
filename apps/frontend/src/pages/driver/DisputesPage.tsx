import { entityLabel } from "../../lib/entity-label";
import { useTranslation } from "react-i18next";
import { useCompanyContext } from "../../contexts/CompanyContext";

export function DisputesPage() {
  const { t } = useTranslation();
  const { selectedCompany } = useCompanyContext();

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold">{t("driver.disputes_title")}</h2>
      <p className="text-xs text-[#1F2A44]">{t("driver.disputes_blurb")}</p>
      {selectedCompany ? (
        <p className="text-xs text-[#6B7280]">
          Company scope: <span>{entityLabel(selectedCompany.short_name ?? selectedCompany.legal_name, selectedCompany.id, "Company")}</span>
        </p>
      ) : null}
    </div>
  );
}
