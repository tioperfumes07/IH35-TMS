import { CargoClaimIntakeSurface } from "./components/CargoClaimIntakeSurface";

type Props = {
  operatingCompanyId: string;
};

/**
 * RBC A23-7: insurance.claim lacks cargo/damage typing — cargo claims use safety.incidents
 * (incident_type=cargo_claim) rather than redirecting to /safety/insurance/claims.
 *
 * SC4: Carmack/49 CFR 1005.2 claim intake — the creator collects load (shipment), claimant
 * (customer), reason (cargo-claim-reasons catalog), claimed amount, and filed date, replacing
 * the location+description-only skeleton. Damage/interchange keep the shared cluster surface.
 */
export function CargoClaimsPage({ operatingCompanyId }: Props) {
  return (
    <CargoClaimIntakeSurface
      operatingCompanyId={operatingCompanyId}
      pageTestId="cargo-claims-page"
      title="Cargo Claims"
      subtitle="Cargo loss and damage claims tracked in the canonical safety incidents cluster."
      createLabel="+ Create cargo claim"
      detailLabel="Open claim"
    />
  );
}
