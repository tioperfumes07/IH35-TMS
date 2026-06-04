/** Shared chart/KPI legend labels — never surface the literal "undefined" in UI. */
export function formatChartLegendLabel(value: unknown): string {
  if (value == null) return "Unknown";
  if (typeof value !== "string") return "Unknown";
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === "undefined") return "Unknown";
  return normalized;
}

export function formatWoStatusLabel(value: unknown): string {
  if (typeof value !== "string") return "Unknown";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "Unknown";
  if (normalized === "unknown") return "Unknown";
  return normalized.replace(/_/g, " ");
}
