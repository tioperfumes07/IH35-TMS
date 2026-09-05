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
  name?: string;
  landmarks?: string[];
};

export type AddressSuggestion = {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
  types: string[];
};

export function geocodeSearch(q: string) {
  return apiRequest<{ enabled: boolean; provider?: "trimble" | "google"; results: GeocodeResult[]; cached?: boolean }>(
    `/api/v1/geocoding/search?q=${encodeURIComponent(q)}`
  );
}

/** Places Autocomplete (New) predictions. `session` = one UUID per typing session (regenerate after a pick). */
export function geocodeSuggest(q: string, session: string) {
  return apiRequest<{ enabled: boolean; provider?: "trimble" | "google"; suggestions: AddressSuggestion[] }>(
    `/api/v1/geocoding/suggest?q=${encodeURIComponent(q)}&session=${encodeURIComponent(session)}`
  );
}

/** Place Details (New) for a picked prediction — closes the session. */
export function geocodePlace(placeId: string, session: string) {
  return apiRequest<{ enabled: boolean; provider?: "trimble" | "google"; result: GeocodeResult }>(
    `/api/v1/geocoding/place/${encodeURIComponent(placeId)}?session=${encodeURIComponent(session)}`
  );
}
