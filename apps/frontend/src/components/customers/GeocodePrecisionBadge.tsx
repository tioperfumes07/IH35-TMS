/**
 * ORDERS CUSTOMERS — geocode-precision badge (rooftop / approximate / locality).
 * Locality is red: "not a stop".
 */
export type GeocodePrecisionBadge = "rooftop" | "approximate" | "locality" | "unknown";

export function normalizeGeocodePrecision(raw: string | null | undefined): GeocodePrecisionBadge {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "locality") return "locality";
  if (v === "rooftop") return "rooftop";
  if (v === "approximate" || v === "range" || v === "geometric_center" || v === "range_interpolated") {
    return "approximate";
  }
  if (!v) return "unknown";
  if (v === "rooftop" || raw === "ROOFTOP") return "rooftop";
  if (raw === "APPROXIMATE" || raw === "GEOMETRIC_CENTER" || raw === "RANGE_INTERPOLATED") return "approximate";
  return "unknown";
}

export function GeocodePrecisionBadgeChip({
  precision,
  "data-testid": testId = "geocode-precision-badge",
}: {
  precision: string | null | undefined;
  "data-testid"?: string;
}) {
  const kind = normalizeGeocodePrecision(precision);
  if (kind === "locality") {
    return (
      <span
        data-testid={testId}
        data-geocode-precision="locality"
        className="inline-flex rounded-sm border border-red-300 bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-700"
        title="City-level only — not a stop"
      >
        locality — not a stop
      </span>
    );
  }
  if (kind === "rooftop") {
    return (
      <span
        data-testid={testId}
        data-geocode-precision="rooftop"
        className="inline-flex rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-1.5 py-0.5 text-xs font-medium text-[#1F2A44]"
      >
        rooftop
      </span>
    );
  }
  if (kind === "approximate") {
    return (
      <span
        data-testid={testId}
        data-geocode-precision="approximate"
        className="inline-flex rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-1.5 py-0.5 text-xs font-medium text-[#4B5563]"
      >
        approximate
      </span>
    );
  }
  return (
    <span
      data-testid={testId}
      data-geocode-precision="unknown"
      className="inline-flex rounded-sm border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-[#4B5563]"
    >
      unknown
    </span>
  );
}
