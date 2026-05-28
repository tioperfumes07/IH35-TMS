export type EldTabId = "live-duty" | "violations" | "unidentified" | "certifications" | "settings";

export type EldTabConfig = {
  id: EldTabId;
  label: string;
  emptyTitle: string;
  emptyBody: string;
};

export const ELD_TABS_CONFIG: readonly EldTabConfig[] = [
  {
    id: "live-duty",
    label: "Live Duty Status",
    emptyTitle: "No live duty events",
    emptyBody: "Duty status changes from Samsara will appear here once ELD synchronization starts.",
  },
  {
    id: "violations",
    label: "HOS Violations",
    emptyTitle: "No HOS violations detected",
    emptyBody: "Violation alerts will appear here when a driver exceeds FMCSA service limits.",
  },
  {
    id: "unidentified",
    label: "Unidentified Driving",
    emptyTitle: "No unidentified driving records",
    emptyBody: "This tab surfaces unassigned ELD events that still need driver reconciliation.",
  },
  {
    id: "certifications",
    label: "Driver Certifications",
    emptyTitle: "No pending certifications",
    emptyBody: "Driver daily logs that require certification will be listed here.",
  },
  {
    id: "settings",
    label: "ELD Settings",
    emptyTitle: "No custom ELD settings",
    emptyBody: "Carrier-level ELD alert preferences and exemptions will appear in this tab.",
  },
];
