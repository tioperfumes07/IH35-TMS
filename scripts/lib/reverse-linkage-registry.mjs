/**
 * CLS-REVERSE-LINKAGE-MISSING — hub profile pages that must mount reverse sections
 * where FKs point (Law §9 / DoD C). Each entry lists the hub file plus string markers
 * that must appear in that file (import + mount). Guard: verify-reverse-linkage-hub-mounts.mjs
 */
export const REVERSE_LINKAGE_HUB_MOUNTS = [
  {
    hub: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
    label: "Driver profile hub",
    required: [
      { label: "LegalMattersReverseSection import", marker: "LegalMattersReverseSection" },
      { label: "Legal matters driver filter", marker: "related_driver_id: id" },
      { label: "InsuranceClaimsReverseSection import", marker: "InsuranceClaimsReverseSection" },
      { label: "Insurance claims driver filter", marker: "driver_id: id" },
      { label: "DriverSafetyReverseSection import", marker: "DriverSafetyReverseSection" },
      { label: "DriverSafetyReverseSection mount", marker: "driver-profile-safety-reverse" },
    ],
  },
  {
    hub: "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx",
    label: "Trailer profile hub",
    required: [
      { label: "LinkedBankTransactionsPanel import", marker: "LinkedBankTransactionsPanel" },
      { label: "Linked bank trailer linkage", marker: 'kind: "trailer_id"' },
      { label: "EntityAuditHistoryTab import", marker: "EntityAuditHistoryTab" },
      { label: "Trailer audit entityType equipment", marker: 'entityType="equipment"' },
    ],
  },
  {
    hub: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
    label: "Vehicle profile hub",
    required: [
      { label: "LinkedBankTransactionsPanel import", marker: "LinkedBankTransactionsPanel" },
      { label: "Linked bank unit linkage", marker: 'kind: "unit_id"' },
    ],
  },
];
