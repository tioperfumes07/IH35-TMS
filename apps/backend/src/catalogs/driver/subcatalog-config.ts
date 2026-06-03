export type DriverSubcatalogConfig = {
  tableName: string;
  urlSegment: string;
  displayName: string;
};

/** CDL / employment lookup codes (single-letter and short tokens allowed). */
export const DRIVER_SUBCATALOG_CODE_REGEX = /^[A-Z0-9-]+$/;

export const DRIVER_SUBCATALOG_CONFIGS: DriverSubcatalogConfig[] = [
  { tableName: "license_classes", urlSegment: "license-classes", displayName: "License Classes" },
  { tableName: "cdl_endorsements", urlSegment: "endorsements", displayName: "CDL Endorsements" },
  { tableName: "cdl_restrictions", urlSegment: "restrictions", displayName: "CDL Restrictions" },
  { tableName: "medical_card_statuses", urlSegment: "medical-card-status", displayName: "Medical Card Status" },
  { tableName: "employment_statuses", urlSegment: "employment-status", displayName: "Employment Status" },
];
