import { SafetyIncidentsClusterSurface } from "./components/SafetyIncidentsClusterSurface";

type Props = {
  operatingCompanyId: string;
};

/**
 * RBC A23-7: insurance.claim lacks cargo/damage typing — cargo claims use safety.incidents
 * (incident_type=cargo_claim) rather than redirecting to /safety/insurance/claims.
 */
export function CargoClaimsPage({ operatingCompanyId }: Props) {
  return (
    <SafetyIncidentsClusterSurface
      operatingCompanyId={operatingCompanyId}
      config={{
        incidentType: "cargo_claim",
        title: "Cargo Claims",
        subtitle: "Cargo loss and damage claims tracked in the canonical safety incidents cluster.",
        pageTestId: "cargo-claims-page",
        createLabel: "+ Create cargo claim",
        detailLabel: "Open claim",
      }}
    />
  );
}
