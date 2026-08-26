/**
 * Governed human labels for mdata.customers.status (display only).
 * Raw enum values stay on the wire / filters / writes.
 */
export type CustomerStatusCode = "active" | "inactive" | "credit_hold" | "blacklist" | string;

export function customerStatusLabel(status: CustomerStatusCode | null | undefined): string {
  if (status == null || status === "") return "—";
  if (status === "credit_hold") return "Credit Hold";
  if (status === "blacklist") return "Blacklist";
  if (status === "inactive") return "Inactive";
  if (status === "active") return "Active";
  // Unknown codes: title-case words, never leak raw snake_case as the only presentation.
  return String(status)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function customerTypeLabel(type: string | null | undefined): string {
  if (type == null || type === "") return "—";
  if (type === "broker") return "Broker";
  if (type === "direct_shipper") return "Direct shipper";
  return String(type)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
