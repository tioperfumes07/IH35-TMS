import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ELD_TABS_CONFIG, type EldTabId } from "./ELD_TABS_CONFIG";
import { HonestEmptyTab } from "./tabs/HonestEmptyTab";
import { LiveDutyTab } from "./tabs/LiveDutyTab";
import { UnidentifiedTab } from "./tabs/UnidentifiedTab";
import { ViolationsTab } from "./tabs/ViolationsTab";

const ELD_TAB_IDS = new Set<string>(ELD_TABS_CONFIG.map((tab) => tab.id));

export function parseEldTab(raw: string | null): EldTabId {
  if (raw && ELD_TAB_IDS.has(raw)) return raw as EldTabId;
  return "live-duty";
}

export function EldPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseEldTab(searchParams.get("tab"));
  const setActiveTab = (next: EldTabId) => {
    const params = new URLSearchParams(searchParams);
    if (next === "live-duty") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  const activeConfig = useMemo(
    () => ELD_TABS_CONFIG.find((tab) => tab.id === activeTab) ?? ELD_TABS_CONFIG[0],
    [activeTab],
  );

  return (
    <div className="space-y-4" data-testid="eld-page">
      <PageHeader title="ELD" subtitle="Electronic logging device activity and FMCSA duty status telemetry" />
      <NavyPageSubNav
        items={ELD_TABS_CONFIG.map((tab) => ({ label: tab.label, to: `#${tab.id}` }))}
        activeId={activeTab}
        onTabChange={(id) => setActiveTab(id as EldTabId)}
        itemIds={ELD_TABS_CONFIG.map((tab) => tab.id)}
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
