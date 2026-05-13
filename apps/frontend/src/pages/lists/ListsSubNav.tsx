import { useLocation } from "react-router-dom";
import { HoverDropdownNav, type NavItem } from "../../components/forms/shared/HoverDropdownNav";

const DOMAIN_ORDER = ["safety", "maintenance", "dispatch", "fuel", "drivers", "fleet", "accounting", "names_master"] as const;

const DOMAIN_LABELS: Record<(typeof DOMAIN_ORDER)[number], string> = {
  safety: "Safety",
  maintenance: "Maintenance",
  dispatch: "Dispatch",
  fuel: "Fuel",
  drivers: "Drivers",
  fleet: "Fleet",
  accounting: "Accounting",
  names_master: "Names master",
};

/**
 * /lists module top sub-nav (invariant #20). Domain + safety catalog links mirror
 * DomainRibbon / hub destinations; nothing removed from existing list UX.
 */
export const LISTS_SUB_NAV_ITEMS: NavItem[] = [
  { label: "Lists & Catalogs", href: "/lists" },
  {
    label: "Catalog domains",
    children: DOMAIN_ORDER.map((domain) => ({
      label: DOMAIN_LABELS[domain],
      href: `/lists/${domain}`,
    })),
  },
  {
    label: "Safety catalogs",
    children: [
      { label: "Internal Fine Reasons", href: "/lists/safety/internal-fine-reasons" },
      { label: "Civil Fine Types", href: "/lists/safety/civil-fine-types" },
      { label: "Company Violation Types", href: "/lists/safety/company-violation-types" },
    ],
  },
];

export function listsSubNavActiveHref(pathname: string): string {
  const norm = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (norm === "/lists") return "/lists";
  if (norm.startsWith("/lists/safety/internal-fine-reasons")) return "/lists/safety/internal-fine-reasons";
  if (norm.startsWith("/lists/safety/civil-fine-types")) return "/lists/safety/civil-fine-types";
  if (norm.startsWith("/lists/safety/company-violation-types")) return "/lists/safety/company-violation-types";
  for (const domain of DOMAIN_ORDER) {
    const prefix = `/lists/${domain}`;
    if (norm === prefix || norm.startsWith(`${prefix}/`)) return prefix;
  }
  return norm;
}

export function ListsSubNav() {
  const { pathname } = useLocation();
  return <HoverDropdownNav items={[...LISTS_SUB_NAV_ITEMS]} activeHref={listsSubNavActiveHref(pathname)} />;
}
