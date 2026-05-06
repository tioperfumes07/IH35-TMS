import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { DataPanel } from "../components/layout/DataPanel";
import { PageHeader } from "../components/layout/PageHeader";

export function ComingSoonPage() {
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const feature = params.get("feature") ?? "Module";
  const rawPhase = params.get("phase");
  const phase = rawPhase && /^\d+$/.test(rawPhase) ? rawPhase : null;
  const eta = params.get("eta") ?? "In active development";
  const subtitle = phase ? `Coming in Phase ${phase}` : "In active development";
  const roadmapText = phase
    ? `${feature} is scheduled for Phase ${phase}. Expected window: ${eta}.`
    : `${feature} is in active development. Expected window: ${eta}.`;

  return (
    <div className="space-y-4">
      <PageHeader title={feature} subtitle={subtitle} />
      <DataPanel title="Roadmap note">
        <div className="text-sm text-gray-600">
          {roadmapText}
        </div>
      </DataPanel>
    </div>
  );
}
