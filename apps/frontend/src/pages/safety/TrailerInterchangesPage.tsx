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
        // SC3 typed creator: interchange party + trailer REQUIRED (an interchange without a
        // trailer is meaningless). Condition-photo confirm follows the TIR pattern.
        typedFields: ["interchange_party"],
        requiredExtraFields: ["trailer_id"],
        confirmWithoutPhotos: true,
      }}
    />
  );
}
