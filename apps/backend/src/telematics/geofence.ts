export type LatLngVertex = {
  lat: number;
  lng: number;
};

export function normalizeVertices(raw: unknown): LatLngVertex[] {
  if (!Array.isArray(raw)) return [];
  const out: LatLngVertex[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const value = entry as { lat?: unknown; lng?: unknown };
    const lat = typeof value.lat === "number" ? value.lat : Number.NaN;
    const lng = typeof value.lng === "number" ? value.lng : Number.NaN;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      out.push({ lat, lng });
    }
  }
  return out;
}

function pointOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): boolean {
  const cross = (py - ay) * (bx - ax) - (px - ax) * (by - ay);
  if (Math.abs(cross) > 1e-12) return false;
  const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
  if (dot < 0) return false;
  const squaredLength = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
  return dot <= squaredLength;
}

export function pointInPolygon(latitude: number, longitude: number, vertices: LatLngVertex[]): boolean {
  if (vertices.length < 3) return false;

  let inside = false;
  const x = longitude;
  const y = latitude;

  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].lng;
    const yi = vertices[i].lat;
    const xj = vertices[j].lng;
    const yj = vertices[j].lat;

    if (pointOnSegment(x, y, xi, yi, xj, yj)) return true;

    const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}
