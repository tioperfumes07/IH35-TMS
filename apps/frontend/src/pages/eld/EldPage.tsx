import { Radio } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";
import { ELD_TABS_CONFIG, type EldTabId } from "./ELD_TABS_CONFIG";

export function EldPage() {
  const [activeTab, setActiveTab] = useState<EldTabId>("live-duty");
  const activeConfig = useMemo(
    () => ELD_TABS_CONFIG.find((tab) => tab.id === activeTab) ?? ELD_TABS_CONFIG[0],
    [activeTab]
  );

  return (
    <div className="space-y-4">
      <PageHeader title="ELD" subtitle="Electronic logging device activity and FMCSA duty status telemetry" />
      <SecondaryNavTabs
        tabs={ELD_TABS_CONFIG.map((tab) => ({ id: tab.id, label: tab.label }))}
        activeId={activeTab}
        onChange={(next) => setActiveTab(next as EldTabId)}
      />
      <section className="rounded border border-gray-200 bg-white p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700">
          <Radio className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{activeConfig.emptyTitle}</h2>
        <p className="mt-1 text-sm text-gray-600">{activeConfig.emptyBody}</p>
      </section>
    </div>
  );
}
