export type TabBadge = "new" | "renamed" | null;
export type TabSurfaceStatus = "Stub" | "Live";

export interface SafetyTab {
  id: string;
  label: string;
  route: string;
  /** Additional mounted route prefixes that belong to this tab's chrome identity. */
  routeAliases?: string[];
  badge: TabBadge;
  status?: TabSurfaceStatus;
}

export interface SafetyGroup {
  id: string;
  label: string;
  tabs: SafetyTab[];
}

export const SAFETY_GROUPS: SafetyGroup[] = [
  {
    id: "driver-files",
    label: "Driver Files & Training",
    tabs: [
      { id: "driver-files", label: "Driver Files", route: "/safety/driver-files", badge: null },
      { id: "drug-alcohol", label: "Drug & Alcohol", route: "/safety/drug-alcohol", badge: null },
      { id: "safety-meetings", label: "Safety Meetings", route: "/safety/safety-meetings", badge: null, status: "Live" },
    ],
  },
  {
    id: "hours-fatigue",
    label: "Hours & Fatigue",
    tabs: [
      { id: "hos", label: "Hours of Service", route: "/safety/hos", badge: null, status: "Live" },
      { id: "hos-violations", label: "HOS Violations", route: "/safety/hos-violations", badge: "new" },
    ],
  },
  {
    id: "inspections-fmcsa",
    label: "Inspections & FMCSA",
    tabs: [
      { id: "idvr", label: "Vehicle Inspections-IDVR", route: "/safety/idvr", badge: "renamed", status: "Live" },
      { id: "dot-inspections", label: "DOT Inspections", route: "/safety/dot-inspections", badge: "new" },
      { id: "driver-scoring", label: "Driver Scoring", route: "/safety/driver-scoring", badge: "new" },
      { id: "csa-score", label: "CSA Score", route: "/safety/csa-score", badge: "new" },
      { id: "dot-compliance", label: "DOT Compliance", route: "/safety/dot-compliance", badge: null },
    ],
  },
  {
    id: "incidents-claims",
    label: "Incidents & Claims",
    tabs: [
      { id: "safety-events", label: "Safety Events", route: "/safety/safety-events", badge: "new" },
      { id: "accidents", label: "Accidents & Incidents", route: "/safety/accidents", badge: null, status: "Live" },
      { id: "damage-reports", label: "Damage Reports", route: "/safety/damage-reports", badge: null, status: "Live" },
      { id: "trailer-interchanges", label: "Trailer Interchanges", route: "/safety/trailer-interchanges", badge: null, status: "Live" },
      { id: "cargo-claims", label: "Cargo Claims", route: "/safety/cargo-claims", badge: null, status: "Live" },
    ],
  },
  {
    id: "fines-discipline",
    label: "Fines & Discipline",
    tabs: [
      { id: "internal-fines", label: "Internal Fines", route: "/safety/internal-fines", badge: null },
      { id: "external-fines", label: "External Fines", route: "/safety/external-fines", badge: null },
      { id: "complaints", label: "Complaints", route: "/safety/complaints", badge: "new" },
    ],
  },
  {
    id: "driver-financial",
    label: "Driver Financial Safety",
    tabs: [{ id: "escrow-record", label: "Escrow Record", route: "/safety/escrow-record", badge: "new", status: "Live" }],
  },
  {
    id: "compliance-monitoring",
    label: "Compliance Docs & Monitoring",
    tabs: [
      { id: "geofence-alerts", label: "Geofence Alerts", route: "/safety/geofence-alerts", badge: "new" },
      { id: "insurance", label: "Insurance", route: "/safety/insurance", badge: null },
      { id: "permits", label: "Permits", route: "/safety/permits", badge: null, status: "Live" },
      { id: "integrity-reports", label: "Integrity Reports", route: "/safety/integrity-reports", badge: "new" },
      { id: "position-history", label: "Position History", route: "/safety/position-history", badge: "new", status: "Live" },
    ],
  },
  {
    id: "workforce-planning",
    label: "Workforce Planning",
    tabs: [
      { id: "driver-scheduler", label: "Driver Scheduler", route: "/safety/driver-scheduler", badge: "new" },
      {
        id: "leave-requests",
        label: "Leave Requests",
        route: "/safety/scheduler/pending-requests",
        routeAliases: ["/safety/scheduler/requests"],
        badge: "new",
      },
      { id: "leave-balances", label: "Leave Balances", route: "/safety/leave-balances", badge: null },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    tabs: [{ id: "settings", label: "Settings", route: "/safety/settings", badge: null }],
  },
];

// Keep a flat tab array for architecture verification tooling.
export const TABS = [
  { id: "driver-files" },
  { id: "drug-alcohol" },
  { id: "safety-meetings" },
  { id: "hos" },
  { id: "hos-violations" },
  { id: "idvr" },
  { id: "dot-inspections" },
  { id: "driver-scoring" },
  { id: "csa-score" },
  { id: "dot-compliance" },
  { id: "safety-events" },
  { id: "accidents" },
  { id: "damage-reports" },
  { id: "trailer-interchanges" },
  { id: "cargo-claims" },
  { id: "internal-fines" },
  { id: "external-fines" },
  { id: "complaints" },
  { id: "escrow-record" },
  { id: "geofence-alerts" },
  { id: "insurance" },
  { id: "permits" },
  { id: "integrity-reports" },
  { id: "position-history" },
  { id: "driver-scheduler" },
  { id: "leave-requests" },
  { id: "leave-balances" },
  { id: "settings" },
];

/**
 * Alias tabs are secondary entry points that live under a DIFFERENT group in the nav, so the
 * active-tab + breadcrumb must reflect the group the user clicked from.
 *
 * "Cert Expiry" (under Compliance Docs & Monitoring) mounts ExpiryDashboard at /safety/cert-expiry —
 * a distinct route AND distinct element from /safety/dot-compliance (DOTComplianceTab, which also
 * embeds ExpiryDashboard plus reminders/CFR cards). Selecting Cert Expiry must produce a consistent
 * state (URL + breadcrumb + active-tab all agree) and must NOT collide with DOT Compliance.
 * Intentionally NOT part of the canonical 28 (SAFETY_GROUPS) — do not add it there or the
 * count/coverage guards break.
 */
export const SAFETY_ALIAS_TABS: { groupId: string; tab: SafetyTab }[] = [
  {
    groupId: "compliance-monitoring",
    tab: { id: "cert-expiry", label: "Cert Expiry", route: "/safety/cert-expiry", badge: "new" },
  },
  // SAF-F22 — six routes were MOUNTED in routes/manifest.tsx with ZERO inbound links anywhere in the
  // app: reachable only by typing the URL. They are real, working surfaces (Training Programs/Records,
  // ELD Audit Trail, 425C Audit Trail, Photo Comparison, Safety Reports), so under §7 additive-only the
  // fix is to give them an entry point — never to delete them.
  //
  // They go in SAFETY_ALIAS_TABS, not SAFETY_GROUPS, deliberately: SAFETY_GROUPS is the owner-locked
  // canonical 28 (SAFETY_CANONICAL_TAB_COUNT + the flat TABS array + verify-safety-count-nav-integrity).
  // Aliases render as real NavLinks inside their group's dropdown (SafetyGroupNav merges them in), so
  // these become clickable without touching the locked count — the same mechanism Cert Expiry uses.
  {
    groupId: "driver-files",
    tab: { id: "training-programs", label: "Training Programs", route: "/safety/training/programs", badge: null },
  },
  {
    groupId: "driver-files",
    tab: { id: "training-records", label: "Training Records", route: "/safety/training/records", badge: null },
  },
  {
    groupId: "hours-fatigue",
    tab: { id: "eld-audit-trail", label: "ELD Audit Trail", route: "/safety/eld/audit-trail", badge: null },
  },
  {
    groupId: "incidents-claims",
    tab: { id: "photo-comparison", label: "Photo Comparison", route: "/safety/photo-comparison", badge: null },
  },
  {
    groupId: "compliance-monitoring",
    tab: { id: "audit-425c", label: "425C Audit Trail", route: "/safety/audit-425c", badge: null },
  },
  {
    groupId: "compliance-monitoring",
    tab: { id: "safety-reports", label: "Safety Reports", route: "/safety/reports", badge: null },
  },
];

export function findSafetyTab(tabId: string) {
  for (const group of SAFETY_GROUPS) {
    for (const tab of group.tabs) {
      if (tab.id === tabId) return { group, tab };
    }
  }
  for (const alias of SAFETY_ALIAS_TABS) {
    if (alias.tab.id !== tabId) continue;
    const group = SAFETY_GROUPS.find((g) => g.id === alias.groupId);
    if (group) return { group, tab: alias.tab };
  }
  return null;
}

function routeMatchesPrefix(path: string, route: string): boolean {
  return path === route || path.startsWith(`${route}/`);
}

/** Resolve mounted Safety routes, including detail routes that are siblings of their list route. */
export function findSafetyTabByPath(path: string) {
  const candidates: Array<{ group: SafetyGroup; tab: SafetyTab; route: string }> = [];
  for (const group of SAFETY_GROUPS) {
    for (const tab of group.tabs) {
      for (const route of [tab.route, ...(tab.routeAliases ?? [])]) {
        if (routeMatchesPrefix(path, route)) candidates.push({ group, tab, route });
      }
    }
  }
  for (const alias of SAFETY_ALIAS_TABS) {
    const group = SAFETY_GROUPS.find((candidate) => candidate.id === alias.groupId);
    if (!group) continue;
    for (const route of [alias.tab.route, ...(alias.tab.routeAliases ?? [])]) {
      if (routeMatchesPrefix(path, route)) candidates.push({ group, tab: alias.tab, route });
    }
  }
  candidates.sort((a, b) => b.route.length - a.route.length);
  return candidates[0] ?? null;
}

/** Canonical inventory for count/nav integrity guards (Block A23-2). */
export const SAFETY_CANONICAL_GROUP_COUNT = 9;
export const SAFETY_CANONICAL_TAB_COUNT = 28;
export const SAFETY_CANONICAL_TAB_KEYS = SAFETY_GROUPS.flatMap((group) =>
  group.tabs.map((tab) => [group.id, tab.id] as const)
);
