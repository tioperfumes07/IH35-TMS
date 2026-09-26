import type { MdataLocation } from "../api/mdata";

/**
 * AlwaysTrack settlement fuel/expense location label.
 *
 * AT PDFs print the card terminal street when present (e.g. "101 PINNACLE ROAD").
 * Our Love's catalog seeds store number + city/state + coords (`Love's #471 — Natalia, TX`)
 * with address_line1 still null on the 604 LOVES-* rows — prefer street when populated,
 * otherwise the catalog name (already AT-readable), else city/state fallback.
 */
export function formatFuelStopLocationLabel(
  loc: Pick<MdataLocation, "name" | "address" | "city" | "state" | "location_code">,
): string {
  const street = loc.address?.trim();
  if (street) {
    const cityState = [loc.city, loc.state].filter(Boolean).join(", ");
    return cityState ? `${street} · ${cityState}` : street;
  }
  const named = loc.name?.trim();
  if (named) return named;
  const cityState = [loc.city, loc.state].filter(Boolean).join(", ");
  if (cityState) return cityState;
  return loc.location_code?.trim() || "Fuel stop";
}

export function formatFuelStopLocationSublabel(
  loc: Pick<MdataLocation, "location_code" | "city" | "state" | "address">,
): string {
  const parts: string[] = [];
  if (loc.location_code) parts.push(loc.location_code);
  // When the primary label already carries city/state (catalog name), still show code only.
  // When primary is a street, append city/state here.
  if (loc.address?.trim()) {
    const cityState = [loc.city, loc.state].filter(Boolean).join(", ");
    if (cityState) parts.push(cityState);
  }
  return parts.join(" · ");
}
