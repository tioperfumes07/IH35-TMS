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
        // SC4 typed creator: claimed amount is live today; claimant / reason / filed-date are
        // FEATURE-DETECTED against the SC4 backend (49 CFR 1005.2) and only persist once it is live.
        typedFields: ["damage_amount_cents", "claimant_customer_id", "claim_reason_code", "claim_filed_at"],
        requiredExtraFields: [],
        sc4GatedFields: ["claimant_customer_id", "claim_reason_code", "claim_filed_at"],
      }}
    />
  );
}
