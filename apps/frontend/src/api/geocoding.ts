import { apiRequest } from "./client";

// PC*MILER/Trimble geocoding — the frontend ONLY ever calls our own backend proxy; the Trimble API key is
// server-side only and never reaches the browser.
export type GeocodeResult = {
  formatted: string;
  address_line1: string;
  city: string;
  state: string;
  country: string;
  zip: string;
  lat: number | null;
  lon: number | null;
};

export function geocodeSearch(q: string) {
  return apiRequest<{ enabled: boolean; results: GeocodeResult[]; cached?: boolean }>(
    `/api/v1/geocoding/search?q=${encodeURIComponent(q)}`
  );
}
