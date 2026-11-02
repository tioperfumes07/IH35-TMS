import { LegalMattersReverseSection } from "../legal/LegalMattersReverseSection";

/**
 * ENG-60: insurance.lawsuit side table retired (0 rows). Reverse chrome now reads legal.matters
 * (same filter keys VehicleProfile / DriverProfile already mount via LegalMattersReverseSection).
 * Kept as a named export so fleet/driver call sites do not break; renders the legal reverse once.
 */
export function InsuranceLawsuitsReverseSection({
  operatingCompanyId,
  filter,
  contextLabel,
}: {
  operatingCompanyId: string;
  filter: { driver_id?: string; unit_id?: string };
  contextLabel: string;
}) {
  const legalFilter = filter.driver_id
    ? ({ related_driver_id: filter.driver_id } as const)
    : filter.unit_id
      ? ({ unit_id: filter.unit_id } as const)
      : null;
  if (!legalFilter) return null;
  return (
    <LegalMattersReverseSection
      operatingCompanyId={operatingCompanyId}
      filter={legalFilter}
      contextLabel={contextLabel}
      data-testid="insurance-lawsuits-reverse"
    />
  );
}
