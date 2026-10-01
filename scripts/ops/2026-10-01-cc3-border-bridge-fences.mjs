#!/usr/bin/env node
// --apply requires --auth AUTH-NNN and runs scripts/verify-owner-authorization.mjs (in 2026-10-01-cc3-lib.mjs args()) before any write.
// BUILD the 5 international bridges as border_crossing fences (USMCA), 400 m, from published coordinates
// (Wikipedia, read 2026-10-01). Polygon = 32-point circle, GeoJSON [lng, lat] like the other 287 border/DOT
// fences. A bridge that already has a border_crossing fence within 1 km is SKIPPED and reported (measured
// 2026-10-01: World Trade -> "World Trade Bridge POE" 140 m; Colombia -> "Laredo Columbia POE" 293 m) --
// a second fence on the same bridge would double every crossing event.
import { run, USMCA } from "./2026-10-01-cc3-lib.mjs";
const BRIDGES = [
  { label: "World Trade International Bridge (Laredo IV) — Laredo, TX / Nuevo Laredo, TAM", lat: 27.597291, lng: -99.537119 },
  { label: "Laredo–Colombia Solidarity International Bridge (Laredo III) — Laredo, TX / Colombia, NL", lat: 27.699716, lng: -99.745646 },
  // Laredo I and II are 464 m apart: a 400 m circle on each would overlap and log one crossing on both
  // bridges, so these two get 225 m (< half the spacing). Every other bridge gets the ordered 400 m.
  { label: "Juárez–Lincoln International Bridge (Laredo II) — Laredo, TX / Nuevo Laredo, TAM", lat: 27.500216, lng: -99.502814, r: 225 },
  { label: "Gateway to the Americas International Bridge (Laredo I) — Laredo, TX / Nuevo Laredo, TAM", lat: 27.4994, lng: -99.50742, r: 225 },
  { label: "Camino Real International Bridge — Eagle Pass, TX / Piedras Negras, COAH", lat: 28.69778, lng: -100.51056 },
];
const RADIUS_M = 400, EXIT_M = 700;
function circle(lat, lng, r, n = 32) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    const dLat = (r * Math.cos(t)) / 111320;
    const dLng = (r * Math.sin(t)) / (111320 * Math.cos((lat * Math.PI) / 180));
    out.push([Number((lng + dLng).toFixed(6)), Number((lat + dLat).toFixed(6))]);
  }
  return out;
}
await run("border_bridge_fences_built", async (c) => {
  const created = [], already = [];
  for (const b of BRIDGES) {
    const near = (await c.query(
      `SELECT count(*)::int n, min(label) existing FROM geo.geofences WHERE operating_company_id=$1 AND location_kind='border_crossing' AND is_active
         AND NOT (id = ANY($4::uuid[]))
         AND 6371000*2*asin(sqrt(power(sin(radians($2::numeric-center_lat)/2),2)+cos(radians(center_lat))*cos(radians($2::numeric))*power(sin(radians($3::numeric-center_lng)/2),2))) < 1000`,
      [USMCA, b.lat, b.lng, created.map((x) => x.id)])).rows[0];
    if (near.n > 0) { already.push({ bridge: b.label, existing_fence: near.existing }); continue; }
    const r = await c.query(
      `INSERT INTO geo.geofences (operating_company_id, label, location_kind, vertices_json, is_active, source, center_lat, center_lng, radius_m, enter_radius_m, exit_radius_m)
       VALUES ($1, $2, 'border_crossing', $3::jsonb, true, 'manual', $4, $5, $6, $6, $7) RETURNING id::text`,
      [USMCA, b.label, JSON.stringify(circle(b.lat, b.lng, b.r ?? RADIUS_M)), b.lat, b.lng, b.r ?? RADIUS_M, Math.round((b.r ?? RADIUS_M) * EXIT_M / RADIUS_M)]);
    created.push({ id: r.rows[0].id, label: b.label, lat: b.lat, lng: b.lng, radius_m: b.r ?? RADIUS_M });
  }
  const total = (await c.query(`SELECT count(*)::int n FROM geo.geofences WHERE operating_company_id=$1 AND location_kind='border_crossing'`, [USMCA])).rows[0].n;
  return { created, already_fenced: already, border_crossing_fences_after: total, radius_m: RADIUS_M, exit_radius_m: EXIT_M, source_of_coordinates: "en.wikipedia.org bridge articles, 2026-10-01" };
});
