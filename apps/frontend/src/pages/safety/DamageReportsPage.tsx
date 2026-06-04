import { SafetyIncidentsClusterSurface } from "./components/SafetyIncidentsClusterSurface";

type Props = {
  operatingCompanyId: string;
};

export function DamageReportsPage({ operatingCompanyId }: Props) {
  return (
    <SafetyIncidentsClusterSurface
      operatingCompanyId={operatingCompanyId}
      config={{
        incidentType: "damage_report",
        title: "Damage Reports",
        subtitle: "Equipment and property damage events with photos and investigation status.",
        pageTestId: "damage-reports-page",
        createLabel: "+ Create damage report",
        detailLabel: "Open report",
      }}
    />
  );
}
