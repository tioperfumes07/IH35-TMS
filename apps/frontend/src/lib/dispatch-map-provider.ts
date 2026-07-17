/**
 * Dispatch map rendering gate — no map SDK is wired in this repo yet (Leaflet/Mapbox/Google Maps).
 * When a provider is integrated, set DISPATCH_MAP_PROVIDER_WIRED = true and mount the real component.
 */
export const DISPATCH_MAP_PROVIDER_WIRED = false;

export function isDispatchMapProviderConfigured(): boolean {
  if (!DISPATCH_MAP_PROVIDER_WIRED) return false;
  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim();
  return Boolean(token);
}
