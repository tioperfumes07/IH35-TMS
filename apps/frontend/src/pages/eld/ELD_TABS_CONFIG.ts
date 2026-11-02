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
    emptyTitle: "Driver log certifications",
    emptyBody:
      "No certification rows for this company yet. Daily log certify events appear here when Samsara ELD ingest lands — this tab stays reachable with no fake rows.",
  },
  {
    id: "settings",
    label: "ELD Settings",
    emptyTitle: "ELD settings",
    emptyBody:
      "No carrier-level ELD alert or exemption settings saved for this company yet. Preferences appear here when the ELD settings API is attached — this tab stays reachable with no fake preferences.",
  },
];
