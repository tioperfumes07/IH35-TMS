import type { AccountingSubNavItem } from "./subnav-manifest";

export const COLLECTIONS_SUBNAV_ITEM: AccountingSubNavItem = {
  label: "Collections",
  path: "/accounting/collections",
  // ACCT-F5050 — travels with Invoices ▾ (AR), not the More overflow.
  section: "invoices",
};
