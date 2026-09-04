import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { DataPanel } from "../components/layout/DataPanel";
import { PageHeader } from "../components/layout/PageHeader";

export type ComingSoonPageProps = {
  /** Overrides the `feature` query param. Lets the route registrar name the placeholder directly. */
  feature?: string;
  /** Overrides the `phase` query param. */
  phase?: string;
  /** Overrides the `eta` query param. */
  eta?: string;
};

export function ComingSoonPage({ feature: featureProp, phase: phaseProp, eta: etaProp }: ComingSoonPageProps = {}) {
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const feature = featureProp ?? params.get("feature") ?? "Module";
  const rawPhase = phaseProp ?? params.get("phase");
  const phase = rawPhase && /^\d+$/.test(rawPhase) ? rawPhase : null;
  const eta = etaProp ?? params.get("eta") ?? "In active development";
  const subtitle = phase ? `Coming in Phase ${phase}` : "In active development";
  const roadmapText = phase
    ? `${feature} is scheduled for Phase ${phase}. Expected window: ${eta}.`
    : `${feature} is in active development. Expected window: ${eta}.`;

  return (
    <div className="space-y-4">
      <PageHeader title={feature} subtitle={subtitle} />
      <DataPanel title="Roadmap note">
        <div className="text-xs text-gray-600">
          {roadmapText}
        </div>
      </DataPanel>
    </div>
  );
}
