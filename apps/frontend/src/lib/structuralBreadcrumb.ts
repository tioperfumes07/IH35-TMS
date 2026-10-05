/**
 * ROUND 367.9 — structural breadcrumb (route-derived, never history).
 *
 * Contract: Module › List › Record. "Up" is the parent crumb href — always the same
 * from a deep link or a refresh. Accounting is CC-2's shell; this helper returns null
 * there so Shell does not double-render.
 */

export type StructuralCrumb = {
  label: string;
  href?: string;
};

type ModuleDef = {
  /** Longest-prefix match key (no trailing slash except root). */
  prefix: string;
  label: string;
  home: string;
};

/**
 * Longer / more-specific prefixes first. Built from SIDEBAR_ITEM_META homes plus
 * common module roots that are not top-level sidebar ids (driver-finance, work-orders).
 */
const MODULES: readonly ModuleDef[] = [
  { prefix: "/safety/insurance", label: "Insurance", home: "/safety/insurance" },
  { prefix: "/driver-finance", label: "Settlements", home: "/driver-finance/settlements" },
  { prefix: "/driver-hub", label: "Driver Hub", home: "/driver-hub" },
  { prefix: "/work-orders", label: "Work Orders", home: "/work-orders" },
  { prefix: "/cash-advances", label: "Cash Advances", home: "/cash-advances" },
  { prefix: "/cash-flow", label: "Cash Flow", home: "/cash-flow" },
  { prefix: "/daily-tasks", label: "Tasks", home: "/daily-tasks" },
  { prefix: "/maintenance", label: "Maintenance", home: "/maintenance" },
  { prefix: "/dispatch", label: "Dispatch", home: "/dispatch" },
  { prefix: "/banking", label: "Banking", home: "/banking" },
  { prefix: "/factoring", label: "Factoring", home: "/factoring" },
  { prefix: "/customers", label: "Customers", home: "/customers" },
  { prefix: "/vendors", label: "Vendors", home: "/vendors" },
  { prefix: "/drivers", label: "Drivers", home: "/drivers" },
  { prefix: "/reports", label: "Reports", home: "/reports" },
  { prefix: "/finance", label: "Finance", home: "/finance" },
  { prefix: "/inventory", label: "Inventory", home: "/inventory" },
  { prefix: "/compliance", label: "Compliance", home: "/compliance" },
  { prefix: "/program", label: "Program", home: "/program" },
  { prefix: "/system", label: "System", home: "/system" },
  { prefix: "/settings", label: "Settings", home: "/settings" },
  { prefix: "/safety", label: "Safety", home: "/safety/home" },
  { prefix: "/fleet", label: "Fleet", home: "/fleet" },
  { prefix: "/fuel", label: "Fuel", home: "/fuel" },
  { prefix: "/lists", label: "Lists", home: "/lists" },
  { prefix: "/legal", label: "Legal", home: "/legal" },
  { prefix: "/tasks", label: "Tasks", home: "/tasks" },
  { prefix: "/users", label: "Users", home: "/users" },
  { prefix: "/help", label: "Help", home: "/help" },
  { prefix: "/docs", label: "Docs", home: "/docs" },
  { prefix: "/eld", label: "ELD", home: "/eld" },
  { prefix: "/425c", label: "425C", home: "/425c" },
  { prefix: "/form-425c", label: "425C", home: "/425c" },
  { prefix: "/admin", label: "Admin", home: "/admin" },
  { prefix: "/home", label: "Home", home: "/home" },
];

const SKIP_PREFIXES = [
  "/accounting",
  "/login",
  "/portal",
  "/apply",
  "/sign",
  "/attorney-review",
  "/owner-approval",
  "/driver-app",
  "/pwa",
  "/public",
  "/legal/privacy",
  "/legal/terms",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_ID_RE = /^\d{3,}$/;

function shouldSkip(pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true;
  return SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function matchModule(pathname: string): ModuleDef | null {
  for (const mod of MODULES) {
    if (pathname === mod.prefix || pathname.startsWith(`${mod.prefix}/`)) return mod;
  }
  return null;
}

/** Plain-English label from a path segment — no underscores, no machine case. */
export function humanizeSegment(seg: string): string {
  if (UUID_RE.test(seg)) return "Detail";
  if (NUMERIC_ID_RE.test(seg)) return seg;
  return seg
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Route → Module › List › Record crumbs. Last crumb has no href.
 * Returns null when Shell must not render (Accounting / public / auth).
 */
export function structuralCrumbsForPath(pathname: string): StructuralCrumb[] | null {
  const path = pathname.split("?")[0] || pathname;
  if (shouldSkip(path)) return null;

  const mod = matchModule(path);
  if (!mod) {
    const segs = path.split("/").filter(Boolean);
    if (segs.length === 0) return null;
    return [{ label: humanizeSegment(segs[segs.length - 1]!) }];
  }

  if (path === mod.home || path === mod.prefix) {
    return [{ label: mod.label }];
  }

  // Path relative to module prefix (not home — home may be a child like /safety/home).
  const rel = path.startsWith(`${mod.prefix}/`) ? path.slice(mod.prefix.length + 1) : "";
  const segs = rel.split("/").filter(Boolean);
  if (segs.length === 0) return [{ label: mod.label }];

  const items: StructuralCrumb[] = [{ label: mod.label, href: mod.home }];

  if (segs.length === 1) {
    // Module › List (or Module › Record when the only segment is an id)
    items.push({ label: humanizeSegment(segs[0]!) });
    return items;
  }

  // Module › List › … › Record
  const listSeg = segs[0]!;
  const listHref = `${mod.prefix}/${listSeg}`;
  items.push({ label: humanizeSegment(listSeg), href: listHref });

  for (let i = 1; i < segs.length - 1; i++) {
    const href = `${mod.prefix}/${segs.slice(0, i + 1).join("/")}`;
    items.push({ label: humanizeSegment(segs[i]!), href });
  }

  items.push({ label: humanizeSegment(segs[segs.length - 1]!) });
  return items;
}

/** Structural parent for Up — never navigate(-1). */
export function structuralParentHref(pathname: string): string {
  const crumbs = structuralCrumbsForPath(pathname);
  if (!crumbs || crumbs.length === 0) return "/home";
  for (let i = crumbs.length - 2; i >= 0; i--) {
    const href = crumbs[i]?.href;
    if (href) return href;
  }
  const mod = matchModule(pathname.split("?")[0] || pathname);
  return mod?.home ?? "/home";
}
