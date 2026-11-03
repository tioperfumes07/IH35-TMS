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
      "Daily log certify events are unavailable on this surface until Samsara ELD ingest lands here — this tab stays reachable with no fake rows (not a proven-empty population).",
  },
  {
    id: "settings",
    label: "ELD Settings",
    emptyTitle: "ELD settings",
    emptyBody:
      "Carrier ELD alert/exemption preferences are unavailable on this surface until the settings API is attached — this tab stays reachable with no fake rows (not a proven-empty preferences set).",
  },
];
