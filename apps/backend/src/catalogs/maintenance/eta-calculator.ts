/**
 * CLOSURE-11 — service interval ETA calculator (12k mi/mo default when no telematics).
 */
export type ServiceEtaInput = {
  intervalMiles: number | null;
  intervalMonths: number | null;
  lastCompletedOdometer: number | null;
  lastCompletedDate: string | Date | null;
  currentOdometer: number | null;
  /** Default 12_000 miles per 30 days per fleet memory. */
  milesPerMonth?: number;
  /** Reference date for day-based math (defaults to now). */
  asOf?: Date;
};

export type ServiceEtaResult = {
  dueAtMiles: number | null;
  dueAtDate: string | null;
  daysUntilDue: number | null;
  milesUntilDue: number | null;
  status: "ok" | "soon" | "overdue";
};

const DEFAULT_MILES_PER_MONTH = 12_000;
const SOON_DAYS = 30;
const SOON_MILES = 5_000;

function toDate(value: string | Date | null): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export function calculateServiceEta(input: ServiceEtaInput): ServiceEtaResult {
  const asOf = input.asOf ?? new Date();
  const milesPerMonth = input.milesPerMonth ?? DEFAULT_MILES_PER_MONTH;
  const milesPerDay = milesPerMonth / 30;

  let dueAtMiles: number | null = null;
  let milesUntilDue: number | null = null;

  if (input.intervalMiles != null && input.intervalMiles > 0) {
    const baseline = input.lastCompletedOdometer ?? 0;
    dueAtMiles = baseline + input.intervalMiles;
    if (input.currentOdometer != null) {
      milesUntilDue = dueAtMiles - input.currentOdometer;
    }
  }

  let dueAtDate: string | null = null;
  let daysUntilDue: number | null = null;

  const lastDate = toDate(input.lastCompletedDate);
  if (input.intervalMonths != null && input.intervalMonths > 0 && lastDate) {
    const due = new Date(lastDate);
    due.setDate(due.getDate() + input.intervalMonths * 30);
    dueAtDate = due.toISOString().slice(0, 10);
    daysUntilDue = daysBetween(asOf, due);
  } else if (milesUntilDue != null && milesPerDay > 0) {
    daysUntilDue = Math.round(milesUntilDue / milesPerDay);
    const projected = new Date(asOf);
    projected.setDate(projected.getDate() + daysUntilDue);
    dueAtDate = projected.toISOString().slice(0, 10);
  }

  let status: ServiceEtaResult["status"] = "ok";
  if (daysUntilDue != null && daysUntilDue < 0) status = "overdue";
  else if (milesUntilDue != null && milesUntilDue < 0) status = "overdue";
  else if (daysUntilDue != null && daysUntilDue <= SOON_DAYS) status = "soon";
  else if (milesUntilDue != null && milesUntilDue <= SOON_MILES) status = "soon";

  return { dueAtMiles, dueAtDate, daysUntilDue, milesUntilDue, status };
}
