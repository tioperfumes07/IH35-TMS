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
    emptyTitle: "Driver log certifications — not wired yet",
    emptyBody:
      "No backend endpoint exists yet for driver daily log certifications (FMCSA certify). This tab stays reachable with an honest empty state — no fake rows. A future block will attach a real read API when ingest lands.",
  },
  {
    id: "settings",
    label: "ELD Settings",
    emptyTitle: "ELD settings — not wired yet",
    emptyBody:
      "No carrier-level ELD alert / exemption settings API exists yet. This tab stays reachable with an honest empty state — no fake preferences. A future block will attach config when product locks the schema.",
  },
];
