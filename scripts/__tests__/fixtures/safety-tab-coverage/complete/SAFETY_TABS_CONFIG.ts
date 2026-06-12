export const SAFETY_GROUPS = [
  { label: "Driver Files & Training", tabs: [{ id: "driver-files" }, { id: "drug-alcohol" }, { id: "safety-meetings" }] },
  { label: "Hours & Fatigue", tabs: [{ id: "hos" }, { id: "hos-violations" }] },
  {
    label: "Inspections & FMCSA",
    tabs: [{ id: "idvr" }, { id: "dot-inspections" }, { id: "driver-scoring" }, { id: "csa-score" }, { id: "dot-compliance" }],
  },
  {
    label: "Incidents & Claims",
    tabs: [{ id: "safety-events" }, { id: "accidents" }, { id: "damage-reports" }, { id: "trailer-interchanges" }, { id: "cargo-claims" }],
  },
  { label: "Fines & Discipline", tabs: [{ id: "internal-fines" }, { id: "external-fines" }] },
  { label: "Driver Financial Safety", tabs: [{ id: "escrow-record" }] },
  {
    label: "Compliance Docs & Monitoring",
    tabs: [{ id: "insurance" }, { id: "permits" }, { id: "integrity-reports" }],
  },
  { label: "Workforce Planning", tabs: [{ id: "driver-scheduler" }, { id: "leave-requests" }, { id: "leave-balances" }] },
  { label: "Settings", tabs: [{ id: "settings" }] },
];
