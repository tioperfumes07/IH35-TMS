import { describe, expect, it } from "vitest";
import { parseVertices, splitValidGeofenceRows } from "../geofences.routes.js";

// LEAD 443.271 — prod stores 345 USMCA fences as GeoJSON-order [lng, lat] pairs; the list route 500'd.
const pairRing = [[-85.492513, 33.6481], [-85.495057, 33.653249], [-85.5012, 33.655382], [-85.507343, 33.653249]];
const objRing = [{ lat: 27.5, lng: -99.5 }, { lat: 27.6, lng: -99.5 }, { lat: 27.6, lng: -99.4 }];
const row = (id: string, vertices_json: unknown) =>
  ({ id, operating_company_id: "c", label: id, location_kind: "custom", location_ref_id: null, location_ref_label: null,
     is_active: true, source: "manual", vertices_json, created_at: "", created_by_user_uuid: null, updated_at: "",
     updated_by_user_uuid: null }) as never;

describe("geofence vertices accept both stored shapes", () => {
  it("[lng, lat] pairs → {lat, lng}", () => {
    expect(parseVertices(pairRing)[0]).toEqual({ lat: 33.6481, lng: -85.492513 });
    expect(parseVertices(pairRing)).toHaveLength(4);
  });
  it("{lat, lng} objects still parse", () => {
    expect(parseVertices(objRing)).toHaveLength(3);
  });
  it("one bad polygon no longer takes the whole list down — it is reported", () => {
    const out = splitValidGeofenceRows([row("ok-pairs", pairRing), row("ok-objs", objRing), row("bad", [[1]])]);
    expect(out.geofences.map((g) => g.id)).toEqual(["ok-pairs", "ok-objs"]);
    expect(out.invalid).toEqual([{ id: "bad", label: "bad", vertex_count: 0, reason: "stored geofence polygon is invalid" }]);
  });
  it("closed GeoJSON ring is produced from pairs", () => {
    const g = splitValidGeofenceRows([row("ok", pairRing)]).geofences[0];
    const ring = g.polygon_geojson.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });
});
