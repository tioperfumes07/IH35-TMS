export type FaultSeverity = "info" | "warn" | "severe" | "critical";

export type SevereFaultCatalogEntry = {
  spn: number;
  label: string;
  severity: FaultSeverity;
  autoCreateWo: boolean;
};

/** Locked J1939 SPN catalog — severe/critical codes auto-create engine diagnostic WOs. */
export const SEVERE_FAULT_CATALOG: readonly SevereFaultCatalogEntry[] = [
  { spn: 110, label: "Engine coolant temperature critical", severity: "critical", autoCreateWo: true },
  { spn: 100, label: "Engine oil pressure low", severity: "critical", autoCreateWo: true },
  { spn: 190, label: "Engine speed abnormal", severity: "severe", autoCreateWo: true },
  { spn: 1569, label: "DEF tank empty", severity: "severe", autoCreateWo: true },
  { spn: 974, label: "Brake system warning", severity: "critical", autoCreateWo: true },
  { spn: 191, label: "Transmission output speed major", severity: "severe", autoCreateWo: true },
  { spn: 127, label: "Transmission oil temperature", severity: "severe", autoCreateWo: true },
  { spn: 639, label: "J1939 network #1", severity: "warn", autoCreateWo: false },
  { spn: 524, label: "Engine exhaust gas recirculation", severity: "warn", autoCreateWo: false },
  { spn: 597, label: "Brake stroke sensor", severity: "warn", autoCreateWo: false },
] as const;

const catalogBySpn = new Map<number, SevereFaultCatalogEntry>(
  SEVERE_FAULT_CATALOG.map((entry) => [entry.spn, entry])
);

export function lookupSpnCatalog(spn: number): SevereFaultCatalogEntry | null {
  return catalogBySpn.get(spn) ?? null;
}

export function resolveFaultSeverity(spn: number, fmi?: number | null): FaultSeverity {
  const entry = lookupSpnCatalog(spn);
  if (entry) return entry.severity;
  if (typeof fmi === "number" && fmi >= 3) return "severe";
  if (typeof fmi === "number" && fmi >= 1) return "warn";
  return "info";
}

export function shouldAutoCreateWorkOrder(severity: FaultSeverity, spn: number): boolean {
  const entry = lookupSpnCatalog(spn);
  if (entry) return entry.autoCreateWo;
  return severity === "severe" || severity === "critical";
}

export function formatFaultCode(spn: number, fmi?: number | null): string {
  return typeof fmi === "number" ? `SPN:${spn}/FMI:${fmi}` : `SPN:${spn}`;
}

export function faultDescription(spn: number, fmi?: number | null): string {
  const entry = lookupSpnCatalog(spn);
  const base = entry?.label ?? `J1939 SPN ${spn}`;
  return typeof fmi === "number" ? `${base} (FMI ${fmi})` : base;
}
