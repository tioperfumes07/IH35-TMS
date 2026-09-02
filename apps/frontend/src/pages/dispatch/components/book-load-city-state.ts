/**
 * Operators type "Laredo, TX" or "Laredo TX" in City and leave St empty.
 * Lane lookup used to stay disabled (needs city+state), miles stayed 0, Book toasted
 * "Enter practical miles before booking".
 */
const STATE_SUFFIX = /^(.*?)(?:[,\s]+|\s)([A-Za-z]{2})$/;

export function parseCityStateInput(raw: string): { city: string; state: string } {
  const s = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return { city: "", state: "" };
  const m = s.match(STATE_SUFFIX);
  if (!m) return { city: s, state: "" };
  const city = m[1].replace(/,/g, "").trim();
  const state = m[2].toUpperCase();
  if (!city || city.length < 2) return { city: s, state: "" };
  return { city, state };
}

export function resolveStopPlace(cityRaw: string, stateRaw: string): { city: string; state: string } {
  const state = String(stateRaw ?? "").trim().toUpperCase();
  const parsed = parseCityStateInput(cityRaw);
  return {
    city: parsed.city || String(cityRaw ?? "").trim(),
    state: state || parsed.state,
  };
}
