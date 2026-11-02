/**
 * C-21 / D24–D33 — honest odometer / PM countdown copy.
 * When Samsara obdOdometerMeters is NULL (feed dead since 2026-09-10), never print a confident
 * "0 mi left" or a silent em-dash. Say why.
 */
import { formatDateUS } from "./formatDate";
import { formatQuantityTable } from "./money";

export function formatNoOdometerReading(sinceIso: string | null | undefined): string {
  const since = sinceIso ? formatDateUS(sinceIso) : "";
  if (since) return `No odometer reading since ${since}`;
  return "No odometer reading on file";
}

/**
 * Miles remaining / odometer cell honesty.
 * - null current odometer → "No odometer reading since <date>" (or on file)
 * - otherwise the numeric miles string
 */
export function formatMilesRemainingHonest(input: {
  milesRemaining: number | null | undefined;
  currentOdometerMi: number | null | undefined;
  odometerReadingAt: string | null | undefined;
}): string | null {
  if (input.currentOdometerMi == null) {
    return formatNoOdometerReading(input.odometerReadingAt);
  }
  if (input.milesRemaining == null) return null;
  return `${formatQuantityTable(Math.max(0, input.milesRemaining), 0)} mi left`;
}

export function formatOdometerCellHonest(input: {
  odometerMi: number | null | undefined;
  odometerReadingAt?: string | null | undefined;
}): string {
  if (input.odometerMi == null) {
    return formatNoOdometerReading(input.odometerReadingAt);
  }
  return `${formatQuantityTable(Math.round(input.odometerMi), 0)} mi`;
}
