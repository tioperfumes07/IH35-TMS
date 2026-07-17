import { useMemo, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ELD_TABS_CONFIG, type EldTabId } from "./ELD_TABS_CONFIG";
import { HonestEmptyTab } from "./tabs/HonestEmptyTab";
import { LiveDutyTab } from "./tabs/LiveDutyTab";
import { UnidentifiedTab } from "./tabs/UnidentifiedTab";
import { ViolationsTab } from "./tabs/ViolationsTab";

export function EldPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [activeTab, setActiveTab] = useState<EldTabId>("live-duty");
  const activeConfig = useMemo(
    () => ELD_TABS_CONFIG.find((tab) => tab.id === activeTab) ?? ELD_TABS_CONFIG[0],
    [activeTab],
  );

  return (
    <div className="space-y-4" data-testid="eld-page">
      <PageHeader title="ELD" subtitle="Electronic logging device activity and FMCSA duty status telemetry" />
      <SecondaryNavTabs
        tabs={ELD_TABS_CONFIG.map((tab) => ({ id: tab.id, label: tab.label }))}
        activeId={activeTab}
        onChange={(next) => setActiveTab(next as EldTabId)}
      />

      {activeTab === "live-duty" ? <LiveDutyTab operatingCompanyId={companyId} /> : null}
      {activeTab === "violations" ? <ViolationsTab operatingCompanyId={companyId} /> : null}
      {activeTab === "unidentified" ? <UnidentifiedTab operatingCompanyId={companyId} /> : null}
      {activeTab === "certifications" ? (
        <HonestEmptyTab
          title={activeConfig.emptyTitle}
          body={activeConfig.emptyBody}
          testId="eld-certifications-honest-empty"
        />
      ) : null}
      {activeTab === "settings" ? (
        <HonestEmptyTab
          title={activeConfig.emptyTitle}
          body={activeConfig.emptyBody}
          testId="eld-settings-honest-empty"
        />
      ) : null}
    </div>
  );
}
