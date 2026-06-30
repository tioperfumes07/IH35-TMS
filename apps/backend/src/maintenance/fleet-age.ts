import { companyBusinessDate } from "../lib/company-business-date.js";

// FLEET-1: Average fleet age (in years) computed ONLY over units that carry a valid model
// year. Units with a null/0/missing model year (e.g. the 72 trailers) MUST be excluded from
// BOTH the numerator and the denominator — folding them in as age 0 collapsed the headline
// "AVG AGE" KPI to ~0.0 even when trucks span model years 2009-2022.
//
// Returns the average age rounded to 1 decimal, or null when no unit has a usable model year
// (the UI shows "-" for null, never "0.0 y").

/** The 4-digit calendar year in the operating company's timezone (anti-UTC convention). */
export function companyCurrentYear(date: Date = new Date()): number {
  // companyBusinessDate -> 'YYYY-MM-DD' in America/Chicago; take the year segment.
  return Number(companyBusinessDate(date).slice(0, 4));
}

/** A model year is usable only if it is a positive, finite 4-digit-ish number. */
function isUsableYear(year: unknown): year is number {
  const n = typeof year === "string" ? Number(year) : year;
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * Average age over year-bearing units only.
 * @param years   model years of the fleet (may contain null/undefined/0/strings)
 * @param currentYear the company-timezone current year (defaults to companyCurrentYear())
 * @returns average age rounded to 1 decimal, or null if no usable year exists
 */
export function avgAgeYears(
  years: ReadonlyArray<number | null | undefined | string>,
  currentYear: number = companyCurrentYear()
): number | null {
  const ages: number[] = [];
  for (const y of years) {
    if (!isUsableYear(y)) continue;
    const year = typeof y === "string" ? Number(y) : y;
    const age = currentYear - year;
    // Guard against future-dated/garbage years producing negative ages.
    if (age < 0) continue;
    ages.push(age);
  }
  if (ages.length === 0) return null;
  const avg = ages.reduce((sum, a) => sum + a, 0) / ages.length;
  return Math.round(avg * 10) / 10;
}
