import { DRIVERS_CANONICAL_SUBNAV_COUNT } from "../../components/drivers/DRIVERS_TABS_CONFIG";
import { DISPATCH_HOME_QUICK_JUMP_COUNT } from "../../components/dispatch/DispatchSubnav";
import { MAINTENANCE_HOME_QUICK_JUMP_COUNT } from "../../components/maintenance/MAINTENANCE_NAV_CONFIG";
import { SAFETY_CANONICAL_TAB_COUNT } from "../../components/safety/SAFETY_TABS_CONFIG";
import { ACCOUNTING_HOME_QUICK_JUMP_COUNT } from "../accounting/subnav-manifest";
import { BANKING_HOME_QUICK_JUMP_COUNT } from "../banking/BANKING_NAV_CONFIG";
import { FUEL_HOME_QUICK_JUMP_COUNT } from "../fuel/FUEL_TABS_CONFIG";

/** Shared HOME quick-jump cards — counts must come from canonical nav registries, never literals. */
export const HOME_QUICK_JUMPS = [
  {
    title: "Maintenance",
    subtitle: "Work orders, R&M, Severe Repair",
    count: MAINTENANCE_HOME_QUICK_JUMP_COUNT,
    to: "/maintenance",
  },
  {
    title: "Accounting",
    subtitle: "Bills, Expenses, Bill payment",
    count: ACCOUNTING_HOME_QUICK_JUMP_COUNT,
    to: "/accounting/invoices",
  },
  {
    title: "Banking",
    subtitle: "Categorize, Reconcile, Transfer",
    count: BANKING_HOME_QUICK_JUMP_COUNT,
    to: "/banking",
  },
  {
    title: "Fuel",
    subtitle: "Relay inbox, Settings, Planner",
    count: FUEL_HOME_QUICK_JUMP_COUNT,
    to: "/fuel",
  },
  {
    title: "Safety",
    subtitle: "HOS, Antidoping, Accidents, DOT",
    count: SAFETY_CANONICAL_TAB_COUNT,
    to: "/safety",
  },
  {
    title: "Drivers",
    subtitle: "Profiles, Settlements, Permits",
    count: DRIVERS_CANONICAL_SUBNAV_COUNT,
    to: "/drivers",
  },
  {
    title: "Dispatch",
    subtitle: "Loads, Settlements, Geofencing",
    count: DISPATCH_HOME_QUICK_JUMP_COUNT,
    to: "/dispatch",
  },
  {
    title: "Lists & Catalogs",
    subtitle: "Eight catalog sets grouped by domain",
    count: null,
    to: "/lists",
  },
] as const;
