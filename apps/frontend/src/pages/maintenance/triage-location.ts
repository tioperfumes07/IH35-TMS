export function formatTriageLocation(issue: { gps_lat?: unknown; gps_lng?: unknown; gps_label?: unknown }): string {
  const label = String(issue.gps_label ?? "").trim();
  if (issue.gps_lat != null && issue.gps_lng != null) {
    return `GPS: ${issue.gps_lat}, ${issue.gps_lng}${label ? ` · ${label}` : ""}`;
  }
  return label ? `Location: ${label}` : "";
}

export function triageDescription(issue: { issue_description?: unknown; gps_lat?: unknown; gps_lng?: unknown; gps_label?: unknown }): string {
  return [String(issue.issue_description ?? "").trim(), formatTriageLocation(issue)].filter(Boolean).join("\n");
}
