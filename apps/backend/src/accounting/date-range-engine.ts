export type DateRangeKey =
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "year_to_date"
  | "last_year"
  | "all_time"
  | "custom"
  | "accounting_period";

export type ResolvedDateRange = {
  key: DateRangeKey;
  from_date: string | null;
  to_date: string;
  label: string;
};

export const RELATIVE_DATE_RANGE_KEYS: DateRangeKey[] = [
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "this_year",
  "year_to_date",
  "last_year",
  "all_time",
];

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function asIsoDate(value: Date): string {
  return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
}

function parseIsoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("invalid_iso_date");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) throw new Error("invalid_iso_date");
  if (asIsoDate(parsed) !== value) throw new Error("invalid_iso_date");
  return parsed;
}

function todayIsoDateUtc() {
  return asIsoDate(new Date());
}

function utcDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function monthLabel(reference: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(reference);
}

function quarterLabel(year: number, quarter: number) {
  return `Q${quarter} ${year}`;
}

function startOfMonth(reference: Date) {
  return utcDate(reference.getUTCFullYear(), reference.getUTCMonth(), 1);
}

function endOfMonth(reference: Date) {
  return utcDate(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 0);
}

function startOfQuarter(reference: Date) {
  const year = reference.getUTCFullYear();
  const quarterStartMonth = Math.floor(reference.getUTCMonth() / 3) * 3;
  return utcDate(year, quarterStartMonth, 1);
}

function endOfQuarter(reference: Date) {
  const start = startOfQuarter(reference);
  return utcDate(start.getUTCFullYear(), start.getUTCMonth() + 3, 0);
}

function startOfYear(reference: Date) {
  return utcDate(reference.getUTCFullYear(), 0, 1);
}

function endOfYear(reference: Date) {
  return utcDate(reference.getUTCFullYear(), 11, 31);
}

function normalizeReferenceDate(referenceDate?: string) {
  return parseIsoDate(referenceDate ?? todayIsoDateUtc());
}

export function resolveRelativeDateRange(key: DateRangeKey, input?: { reference_date?: string }): ResolvedDateRange {
  const reference = normalizeReferenceDate(input?.reference_date);
  const referenceIso = asIsoDate(reference);

  if (key === "this_month") {
    return {
      key,
      from_date: asIsoDate(startOfMonth(reference)),
      to_date: asIsoDate(endOfMonth(reference)),
      label: monthLabel(reference),
    };
  }

  if (key === "last_month") {
    const monthStart = startOfMonth(reference);
    const prevMonthRef = utcDate(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1);
    return {
      key,
      from_date: asIsoDate(startOfMonth(prevMonthRef)),
      to_date: asIsoDate(endOfMonth(prevMonthRef)),
      label: monthLabel(prevMonthRef),
    };
  }

  if (key === "this_quarter") {
    const start = startOfQuarter(reference);
    const quarter = Math.floor(start.getUTCMonth() / 3) + 1;
    return {
      key,
      from_date: asIsoDate(start),
      to_date: asIsoDate(endOfQuarter(reference)),
      label: quarterLabel(start.getUTCFullYear(), quarter),
    };
  }

  if (key === "last_quarter") {
    const thisQStart = startOfQuarter(reference);
    const prevQuarterRef = utcDate(thisQStart.getUTCFullYear(), thisQStart.getUTCMonth() - 3, 1);
    const start = startOfQuarter(prevQuarterRef);
    const quarter = Math.floor(start.getUTCMonth() / 3) + 1;
    return {
      key,
      from_date: asIsoDate(start),
      to_date: asIsoDate(endOfQuarter(prevQuarterRef)),
      label: quarterLabel(start.getUTCFullYear(), quarter),
    };
  }

  if (key === "this_year") {
    const year = reference.getUTCFullYear();
    return {
      key,
      from_date: asIsoDate(startOfYear(reference)),
      to_date: asIsoDate(endOfYear(reference)),
      label: String(year),
    };
  }

  if (key === "year_to_date") {
    return {
      key,
      from_date: asIsoDate(startOfYear(reference)),
      to_date: referenceIso,
      label: "Year to date",
    };
  }

  if (key === "last_year") {
    const prevYearRef = utcDate(reference.getUTCFullYear() - 1, 0, 1);
    return {
      key,
      from_date: asIsoDate(startOfYear(prevYearRef)),
      to_date: asIsoDate(endOfYear(prevYearRef)),
      label: String(prevYearRef.getUTCFullYear()),
    };
  }

  if (key === "all_time") {
    return {
      key,
      from_date: null,
      to_date: referenceIso,
      label: "All time",
    };
  }

  throw new Error(`unsupported_relative_key:${key}`);
}

export function resolveCustomDateRange(input: { from_date: string; to_date: string; label?: string }): ResolvedDateRange {
  const from = parseIsoDate(input.from_date);
  const to = parseIsoDate(input.to_date);
  if (from.getTime() > to.getTime()) throw new Error("invalid_custom_range_order");
  return {
    key: "custom",
    from_date: asIsoDate(from),
    to_date: asIsoDate(to),
    label: input.label?.trim() || "Custom",
  };
}

export function deriveAccountingPeriodLabel(period: {
  period_label: string | null;
  period_start: string;
  period_end: string;
  fiscal_year: number;
}) {
  const explicit = period.period_label?.trim();
  if (explicit) return explicit;
  return `FY${period.fiscal_year}: ${period.period_start} to ${period.period_end}`;
}

export function resolveRelativeDateRanges(input?: { reference_date?: string }): ResolvedDateRange[] {
  return RELATIVE_DATE_RANGE_KEYS.map((key) => resolveRelativeDateRange(key, input));
}
