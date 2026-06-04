export type TabBadge = "new" | "renamed" | null;
export type TabSurfaceStatus = "Stub" | "Live";

export interface SafetyTab {
  id: string;
  label: string;
  route: string;
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
    tabs: [{ id: "escrow-record", label: "Escrow Record", route: "/safety/escrow-record", badge: "new" }],
  },
  {
    id: "compliance-monitoring",
    label: "Compliance Docs & Monitoring",
    tabs: [
      { id: "geofence-alerts", label: "Geofence Alerts", route: "/safety/geofence-alerts", badge: "new" },
      { id: "insurance", label: "Insurance", route: "/safety/insurance", badge: null },
      { id: "permits", label: "Permits", route: "/safety/permits", badge: null },
      { id: "integrity-reports", label: "Integrity Reports", route: "/safety/integrity-reports", badge: "new" },
    ],
  },
  {
    id: "workforce-planning",
    label: "Workforce Planning",
    tabs: [
      { id: "driver-scheduler", label: "Driver Scheduler", route: "/safety/driver-scheduler", badge: "new" },
      { id: "leave-requests", label: "Leave Requests", route: "/safety/scheduler/pending-requests", badge: "new" },
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
  { id: "driver-scheduler" },
  { id: "leave-requests" },
  { id: "leave-balances" },
  { id: "settings" },
];

export function findSafetyTab(tabId: string) {
  for (const group of SAFETY_GROUPS) {
    for (const tab of group.tabs) {
      if (tab.id === tabId) return { group, tab };
    }
  }
  return null;
}

/** Canonical inventory for count/nav integrity guards (Block A23-2). */
export const SAFETY_CANONICAL_GROUP_COUNT = 9;
export const SAFETY_CANONICAL_TAB_COUNT = 27;
export const SAFETY_CANONICAL_TAB_KEYS = SAFETY_GROUPS.flatMap((group) =>
  group.tabs.map((tab) => [group.id, tab.id] as const)
);
