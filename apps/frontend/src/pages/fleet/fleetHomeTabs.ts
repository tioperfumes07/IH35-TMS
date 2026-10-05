/**
 * FLT-F424 — Fleet module tabs. Home is the landing page; roster is Units / Trailers.
 * Parsed the same way as parseDriverSubnav.
 */

export const FLEET_HOME_TABS = [
  { id: "home", label: "Home" },
  { id: "units", label: "Units" },
  { id: "trailers", label: "Trailers" },
  { id: "transfers", label: "Transfers" },
  { id: "roster_integrity", label: "Roster integrity" },
  { id: "maintenance", label: "Maintenance" },
] as const;

export type FleetHomeTabId = (typeof FLEET_HOME_TABS)[number]["id"];

const IDS = FLEET_HOME_TABS.map((t) => t.id);

export function parseFleetHomeTab(raw: string | null | URLSearchParams): FleetHomeTabId {
  const value = raw instanceof URLSearchParams ? raw.get("tab") : raw;
  if (!value) return "home";
  const key = value.trim().toLowerCase().replace(/-/g, "_");
  if (key === "roster") return "units";
  return (IDS as readonly string[]).includes(key) ? (key as FleetHomeTabId) : "home";
}

export function fleetHomeTabHref(tab: FleetHomeTabId): string {
  return tab === "home" ? "/fleet" : `/fleet?tab=${tab}`;
}
