export type DtcSeverity = "critical" | "major" | "minor" | "info";

const CRITICAL_PREFIXES = ["P030", "P031", "P0420", "P0700", "U0100"];

export function classifyDtcCode(code: string): DtcSeverity {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return "info";

  if (CRITICAL_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return "critical";
  if (normalized.startsWith("P0") || normalized.startsWith("U0")) return "major";
  if (normalized.startsWith("P1") || normalized.startsWith("C") || normalized.startsWith("B")) return "minor";
  return "info";
}
