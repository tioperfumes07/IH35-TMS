export const FLEET_TYPE_FILTER_OPTIONS = [
  { value: "", label: "All" },
  { value: "Truck", label: "Truck" },
  { value: "Tractor", label: "Tractor" },
  { value: "Reefer", label: "Reefer" },
  { value: "DryVan", label: "DryVan" },
  { value: "Flatbed", label: "Flatbed" },
  { value: "Stepdeck", label: "Stepdeck" },
  { value: "Lowboy", label: "Lowboy" },
  { value: "Tanker", label: "Tanker" },
  { value: "Custom", label: "Custom" },
] as const;

export type FleetTypeFilterValue = (typeof FLEET_TYPE_FILTER_OPTIONS)[number]["value"];

export function isFleetTypeFilterValue(value: string | null): value is Exclude<FleetTypeFilterValue, ""> {
  return FLEET_TYPE_FILTER_OPTIONS.some((option) => option.value !== "" && option.value === value);
}

export function parseFleetTypeFilter(searchParams: URLSearchParams): FleetTypeFilterValue {
  const raw = searchParams.get("type") ?? "";
  if (raw === "" || raw === "All") return "";
  return isFleetTypeFilterValue(raw) ? raw : "";
}
