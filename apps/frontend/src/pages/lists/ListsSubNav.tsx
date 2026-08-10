import { useLocation } from "react-router-dom";
import { HoverDropdownNav, type NavChild, type NavItem } from "../../components/forms/shared/HoverDropdownNav";
import { buildCatalogPath, DOMAIN_CONFIG } from "./components/AllCatalogsMap";

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

/** Live catalogs for a domain from DOMAIN_CONFIG — hub + subnav must not diverge (LST-F100/F101). */
function domainCatalogNavChildren(domainKey: string): NavChild[] {
  const domain = DOMAIN_CONFIG.find((d) => d.key === domainKey);
  if (!domain) return [];
  const seen = new Set<string>();
  const children: NavChild[] = [];
  for (const catalog of domain.catalogs) {
    if (!catalog.live || !catalog.catalogKey) continue;
    if (seen.has(catalog.catalogKey)) continue;
    seen.add(catalog.catalogKey);
    children.push({
      label: catalog.name,
      href: buildCatalogPath(domainKey, catalog.catalogKey),
    });
  }
  return children;
}

const SAFETY_CATALOG_CHILDREN = domainCatalogNavChildren("safety");
const SAFETY_CATALOG_HREF =
  SAFETY_CATALOG_CHILDREN[0]?.href ?? "/lists/safety/internal-fine-reasons";

const FLEET_CATALOG_CHILDREN = domainCatalogNavChildren("fleet");
const FLEET_CATALOG_HREF = FLEET_CATALOG_CHILDREN[0]?.href ?? "/lists/fleet";

const DISPATCH_CATALOG_CHILDREN = domainCatalogNavChildren("dispatch");
const DISPATCH_CATALOG_HREF = DISPATCH_CATALOG_CHILDREN[0]?.href ?? "/lists/dispatch";

/**
 * /lists module top sub-nav (invariant #20). Domain + safety/fleet/dispatch catalog links mirror
 * DomainRibbon / hub destinations; nothing removed from existing list UX.
 */
export const LISTS_SUB_NAV_ITEMS: NavItem[] = [
  { label: "Lists & Catalogs", href: "/lists" },
  { label: "Names Master", href: "/lists/names" },
  { label: "Catalog Index", href: "/lists/catalogs" },
  {
    label: "Catalog domains",
    href: "/lists/catalogs",
    children: DOMAIN_ORDER.map((domain) => ({
      label: DOMAIN_LABELS[domain],
      href: `/lists/${domain}`,
    })),
  },
  {
    label: "Safety catalogs",
    href: SAFETY_CATALOG_HREF,
    children: [
      // Arch-design verify reads literal labels inside LISTS_SUB_NAV_ITEMS (not const refs).
      { label: "Internal Fine Reasons", href: "/lists/safety/internal-fine-reasons" },
      { label: "Civil Fine Types", href: "/lists/safety/civil-fine-types" },
      { label: "Company Violation Types", href: "/lists/safety/company-violation-types" },
      ...SAFETY_CATALOG_CHILDREN.filter(
        (child) =>
          child.label !== "Internal Fine Reasons" &&
          child.label !== "Civil Fine Types" &&
          child.label !== "Company Violation Types"
      ),
    ],
  },
  {
    label: "Fleet catalogs",
    href: FLEET_CATALOG_HREF,
    children: FLEET_CATALOG_CHILDREN,
  },
  {
    label: "Dispatch catalogs",
    href: DISPATCH_CATALOG_HREF,
    children: DISPATCH_CATALOG_CHILDREN,
  },
  {
    label: "Maintenance catalogs",
    href: "/lists/maintenance/parts-catalog",
    children: [
      { label: "Parts Catalog", href: "/lists/maintenance/parts-catalog" },
    ],
  },
];

export function listsSubNavActiveHref(pathname: string): string {
  const norm = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (norm === "/lists") return "/lists";
  if (norm.startsWith("/lists/names")) return "/lists/names";
  if (norm.startsWith("/lists/catalogs")) return "/lists/catalogs";
  if (norm.startsWith("/lists/maintenance/parts-catalog")) return "/lists/maintenance/parts-catalog";
  for (const child of [...SAFETY_CATALOG_CHILDREN, ...FLEET_CATALOG_CHILDREN, ...DISPATCH_CATALOG_CHILDREN]) {
    if (norm === child.href || norm.startsWith(`${child.href}/`)) return child.href;
  }
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
