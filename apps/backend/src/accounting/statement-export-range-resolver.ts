import { resolveRelativeDateRange, type DateRangeKey } from "./date-range-engine.js";

export const EXPORT_RANGE_KEYS = [
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "this_year",
  "year_to_date",
  "last_year",
  "all_time",
  "custom",
] as const;

export type ExportRangeKey = (typeof EXPORT_RANGE_KEYS)[number];

export function isExportRangeKey(value: string): value is ExportRangeKey {
  return (EXPORT_RANGE_KEYS as readonly string[]).includes(value);
}

export function resolveExportRange(input: {
  range_key?: ExportRangeKey;
  from_date?: string;
  to_date?: string;
}): { from_date: string | undefined; to_date: string } {
  if (input.range_key) {
    if (input.range_key === "custom") {
      if (!input.from_date || !input.to_date) throw new Error("custom_range_requires_from_to");
      return { from_date: input.from_date, to_date: input.to_date };
    }
    const resolved = resolveRelativeDateRange(input.range_key as DateRangeKey);
    return { from_date: resolved.from_date ?? undefined, to_date: resolved.to_date };
  }

  if (!input.from_date || !input.to_date) throw new Error("from_to_required_without_range_key");
  return { from_date: input.from_date, to_date: input.to_date };
}
