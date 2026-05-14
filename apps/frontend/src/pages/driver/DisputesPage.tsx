import { useTranslation } from "react-i18next";
import { getOperatingCompanyId } from "../../lib/auth-token";

export function DisputesPage() {
  const { t } = useTranslation();
  const companyId = getOperatingCompanyId();

  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold">{t("driver.disputes_title")}</h2>
      <p className="text-sm text-slate-700">{t("driver.disputes_blurb")}</p>
      {companyId ? (
        <p className="text-[11px] text-slate-500">
          Company scope: <span className="font-mono">{companyId}</span>
        </p>
      ) : null}
    </div>
  );
}
