/** CLOSURE additive Drivers subtab ids/paths (outside locked DRIVERS_SUBNAV count of 9). */

export const DRIVERS_AUTO_DEDUCTIONS_SUBTAB_ID = "auto_deductions" as const;
/** Alias of canonical `/drivers/deductions` — manifest Navigate-redirects this URL. */
export const DRIVERS_AUTO_DEDUCTIONS_SUBTAB_PATH = "/drivers/auto-deductions";
export const DRIVERS_DISPUTES_SUBTAB_ID = "disputes" as const;
export const DRIVERS_DISPUTES_SUBTAB_PATH = "/drivers/disputes";
export const DRIVERS_TEAM_SPLITS_SUBTAB_ID = "team_splits" as const;
export const DRIVERS_TEAM_SPLITS_SUBTAB_PATH = "/drivers/team-splits";

export type DriversExtendedSubtabId =
  | typeof DRIVERS_AUTO_DEDUCTIONS_SUBTAB_ID
  | typeof DRIVERS_DISPUTES_SUBTAB_ID
  | typeof DRIVERS_TEAM_SPLITS_SUBTAB_ID;
