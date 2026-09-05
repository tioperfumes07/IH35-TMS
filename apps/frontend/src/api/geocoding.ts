import { apiRequest } from "./client";

// Address geocoding — the frontend ONLY ever calls our own backend proxy, which chooses the provider
// (Trimble/PC*MILER or Google). Provider API keys are server-side only and never reach the browser.
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
  return apiRequest<{ enabled: boolean; provider?: "trimble" | "google"; results: GeocodeResult[]; cached?: boolean }>(
    `/api/v1/geocoding/search?q=${encodeURIComponent(q)}`
  );
}
