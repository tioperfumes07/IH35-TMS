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
  return apiRequest<{ enabled: boolean; provider?: "trimble" | "google"; suggestions: AddressSuggestion[]; results?: GeocodeResult[] }>(
    `/api/v1/geocoding/suggest?q=${encodeURIComponent(q)}&session=${encodeURIComponent(session)}`
  );
}

/** Place Details (New) for a picked prediction — closes the session. */
export function geocodePlace(placeId: string, session: string) {
  return apiRequest<{ enabled: boolean; provider?: "trimble" | "google"; result: GeocodeResult }>(
    `/api/v1/geocoding/place/${encodeURIComponent(placeId)}?session=${encodeURIComponent(session)}`
  );
}

// DSP-48 (owner ruling 2026-09-05, "Google distance = REFERENCE ONLY"): one Google Routes
// computeRoutes call per leg, server-side key, 5-min cache. A grey, read-only comparison figure
// — never editable, never copied into miles_practical/miles_shortest, never into pay/RPM/
// settlement (LAW §2, enforced by scripts/verify-google-reference-miles.mjs).
export type RouteReferenceLatLng = { lat: number; lng: number };
export type RouteReferenceLeg = { from: RouteReferenceLatLng; to: RouteReferenceLatLng };
export type RouteReferenceResult = { miles: number; minutes: number; cached?: boolean } | null;

export function geocodeRouteReference(legs: RouteReferenceLeg[]) {
  return apiRequest<{ enabled: boolean; legs: RouteReferenceResult[] }>("/api/v1/geocoding/route-reference", {
    method: "POST",
    body: { legs },
  });
}
