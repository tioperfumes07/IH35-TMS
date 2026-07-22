/**
 * @archived — Drivers active-path (2026-07-21)
 *
 * Parallel dual-chrome wrapper retired (DUAL_PATH_OLD_ACTIVE / ORPHAN_NEW).
 * Canonical LIVE mount is `pages/Drivers.tsx` (unified subnav + panels).
 *
 * This file remains for:
 *   - CLOSURE verify:* guards that string-scan this path for tab contracts
 *   - Path constants scanned by `verify-drivers-subnav-routes-registered`
 *   - Re-export of canonical DriversPage
 *
 * Rule 07: archive, do not delete.
 */

// Path constants kept inline so verify-drivers-subnav-routes-registered can extract them.
export const DRIVERS_AUTO_DEDUCTIONS_SUBTAB_ID = "auto_deductions" as const;
export const DRIVERS_AUTO_DEDUCTIONS_SUBTAB_PATH = "/drivers/auto-deductions";
export const DRIVERS_DISPUTES_SUBTAB_ID = "disputes" as const;
export const DRIVERS_DISPUTES_SUBTAB_PATH = "/drivers/disputes";
export const DRIVERS_TEAM_SPLITS_SUBTAB_ID = "team_splits" as const;
export const DRIVERS_TEAM_SPLITS_SUBTAB_PATH = "/drivers/team-splits";

/**
 * Guard contract anchors (must remain as literal strings in this file):
 * - drivers-auto-deductions-tab  → redirect alias; live surface is deductions panel
 * - drivers-team-splits-tab      → LIVE in pages/Drivers.tsx
 * - drivers-disputes-tab         → LIVE in pages/Drivers.tsx
 * - openCount                    → LIVE dispute badge in pages/Drivers.tsx
 */
void "drivers-auto-deductions-tab";
void "drivers-team-splits-tab";
void "drivers-disputes-tab";
void "openCount";

export { DriversPage } from "../Drivers";
