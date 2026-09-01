/** Server-assigned display_id when present; otherwise a stable IF- prefix from the uuid. */
export function internalFineDisplayId(row: Record<string, unknown>): string {
  const fromServer = String(row.display_id ?? "").trim();
  if (fromServer) return fromServer;
  const id = String(row.id ?? "").trim();
  if (!id) return "Internal fine";
  return `IF-${id.slice(0, 8).toUpperCase()}`;
}
