import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { DataPanel } from "../components/layout/DataPanel";
import { PageHeader } from "../components/layout/PageHeader";

export function ComingSoonPage() {
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const feature = params.get("feature") ?? "Module";
  const phase = params.get("phase") ?? "2";
  const eta = params.get("eta") ?? "Upcoming phase";

  return (
    <div className="space-y-4">
      <PageHeader title={feature} subtitle={`Coming in Phase ${phase}`} />
      <DataPanel title="Roadmap note">
        <div className="text-sm text-gray-600">
          {feature} is scheduled for Phase {phase}. Expected window: {eta}.
        </div>
      </DataPanel>
    </div>
  );
}
