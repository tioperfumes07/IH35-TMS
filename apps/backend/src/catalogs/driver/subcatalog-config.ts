export type DriverSubcatalogConfig = {
  tableName: string;
  urlSegment: string;
  displayName: string;
  successorListsSegment: string;
};

/** CDL / employment lookup codes (single-letter and short tokens allowed). */
export const DRIVER_SUBCATALOG_CODE_REGEX = /^[A-Z0-9-]+$/;

/** PR #403 catalogs.* sub-catalogs — deprecated by A17.2; canonical path is reference.* via /lists/drivers/*. */
export const DRIVER_SUBCATALOG_CONFIGS: DriverSubcatalogConfig[] = [
  {
    tableName: "license_classes",
    urlSegment: "license-classes",
    displayName: "License Classes",
    successorListsSegment: "license-classes",
  },
  {
    tableName: "cdl_endorsements",
    urlSegment: "endorsements",
    displayName: "CDL Endorsements",
    successorListsSegment: "endorsements",
  },
  {
    tableName: "cdl_restrictions",
    urlSegment: "restrictions",
    displayName: "CDL Restrictions",
    successorListsSegment: "restrictions",
  },
  {
    tableName: "medical_card_statuses",
    urlSegment: "medical-card-status",
    displayName: "Medical Card Status",
    successorListsSegment: "medical-card-status",
  },
  {
    tableName: "employment_statuses",
    urlSegment: "employment-status",
    displayName: "Employment Status",
    successorListsSegment: "employment-status",
  },
];
