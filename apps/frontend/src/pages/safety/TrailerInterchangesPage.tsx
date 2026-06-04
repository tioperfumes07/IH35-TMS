import { SafetyIncidentsClusterSurface } from "./components/SafetyIncidentsClusterSurface";

type Props = {
  operatingCompanyId: string;
};

export function TrailerInterchangesPage({ operatingCompanyId }: Props) {
  return (
    <SafetyIncidentsClusterSurface
      operatingCompanyId={operatingCompanyId}
      config={{
        incidentType: "trailer_interchange",
        title: "Trailer Interchanges",
        subtitle: "Trailer interchange agreements, parties, and damage documentation.",
        pageTestId: "trailer-interchanges-page",
        createLabel: "+ Create interchange",
        detailLabel: "Open interchange",
      }}
    />
  );
}
