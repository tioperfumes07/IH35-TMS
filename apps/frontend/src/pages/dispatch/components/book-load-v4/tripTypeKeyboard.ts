/** ROUND 8.20 board17 — keyboard selection for NB/TR/SB trip-type radiogroup. */
export const TRIP_TYPE_ORDER = ["NB", "TR", "SB"] as const;
export type TripTypeCode = (typeof TRIP_TYPE_ORDER)[number];

export function nextTripTypeFromKey(
  key: string,
  current: string | null | undefined,
): TripTypeCode | null {
  const cur = TRIP_TYPE_ORDER.indexOf((current || "") as TripTypeCode);
  let nextIdx = cur < 0 ? 0 : cur;
  if (key === "ArrowRight" || key === "ArrowDown") nextIdx = (cur < 0 ? 0 : (cur + 1) % TRIP_TYPE_ORDER.length);
  else if (key === "ArrowLeft" || key === "ArrowUp")
    nextIdx = cur < 0 ? 0 : (cur - 1 + TRIP_TYPE_ORDER.length) % TRIP_TYPE_ORDER.length;
  else if (key === "Home") nextIdx = 0;
  else if (key === "End") nextIdx = TRIP_TYPE_ORDER.length - 1;
  else return null;
  return TRIP_TYPE_ORDER[nextIdx];
}
