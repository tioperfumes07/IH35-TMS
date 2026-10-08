export const CODE_REGEX = /^[A-Z][A-Z0-9-]+$/;

export type StatusFilter = "true" | "false" | "all";

export const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
  { value: "all", label: "All" },
];

export function statusPillClass(isActive: boolean) {
  return isActive ? "rounded-sm bg-[#F7F8FA] px-2 py-0.5 text-xs font-semibold text-[#1F2A44]" : "rounded-sm bg-[#F7F8FA] px-2 py-0.5 text-xs font-semibold text-[#4B5563]";
}

export function moneyFromCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}
