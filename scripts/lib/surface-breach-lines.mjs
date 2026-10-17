/**
 * The ONE parser for `SURFACE-BREACH-AUTHORIZED: <SEAT> <reason>` lines in commit bodies.
 *
 * Shared by verify-seat-surface-ownership.mjs (§0b surfaces) and verify-lane-ownership.mjs (docs/bus/LANES.md
 * lanes) — LEAD 14:30Z: one cross-lane system. Before this the lane guard accepted only a local LANE_CROSS env,
 * which CI never sets, so every Lead-authorized cross-lane PR failed step 11533 in CI while passing step 10315.
 */

const AUTH_RE = /SURFACE-BREACH-AUTHORIZED:\s*([A-Za-z0-9-]+)/gi;

/** All seats named in SURFACE-BREACH-AUTHORIZED lines, as written (app-wide sweeps may list one per owner). */
export function authorizedSeatsFromBody(commitBody) {
  const seats = new Set();
  for (const match of String(commitBody ?? "").matchAll(AUTH_RE)) {
    if (match[1]) seats.add(match[1]);
  }
  return seats;
}

/** Canonical seat key for comparing names across the two maps: "cc1" / "CC-1" -> "CC-1", "Cursor" -> "CURSOR". */
export function canonicalSeat(name) {
  const s = String(name ?? "").trim().toUpperCase();
  const cc = s.match(/^CC-?([123])$/);
  return cc ? `CC-${cc[1]}` : s;
}

/** Canonical seats named in the body's SURFACE-BREACH-AUTHORIZED lines. */
export function authorizedCanonicalSeats(commitBody) {
  return new Set([...authorizedSeatsFromBody(commitBody)].map(canonicalSeat));
}
