import puppeteer from "puppeteer";

export type Form2290VehicleInput = {
  unitId: string;
  unitNumber: string;
  vin: string;
  grossWeightLbs: number;
  firstUsedMonth: string | null;
  suspensionClaimed: boolean;
};

export type Form2290VehicleComputed = Form2290VehicleInput & {
  grossWeightCategory: string;
  annualTax: number;
  taxDue: number;
};

const ANNUAL_TAX_BY_CATEGORY: Record<string, number> = {
  A: 100,
  B: 122,
  C: 144,
  D: 166,
  E: 188,
  F: 210,
  G: 232,
  H: 254,
  I: 276,
  J: 298,
  K: 320,
  L: 342,
  M: 364,
  N: 386,
  O: 408,
  P: 430,
  Q: 452,
  R: 474,
  S: 496,
  T: 518,
  U: 550,
  V: 550,
  W: 0,
};

export function grossWeightCategoryFromLbs(lbs: number): string {
  if (lbs < 55_000) return "W";
  if (lbs >= 75_000) return "V";
  const index = Math.min(21, Math.floor((lbs - 55_000) / 1_000));
  return String.fromCharCode(65 + index);
}

export function annualTaxForCategory(category: string): number {
  return ANNUAL_TAX_BY_CATEGORY[category] ?? 550;
}

/** Partial-year proration by month first used in the July–June tax period. */
export function partialYearTaxFactor(firstUsedMonth: string | null, taxPeriodStart: string): number {
  if (!firstUsedMonth) return 1;
  const used = new Date(`${firstUsedMonth}T00:00:00Z`);
  const periodStart = new Date(`${taxPeriodStart}T00:00:00Z`);
  if (Number.isNaN(used.getTime()) || used <= periodStart) return 1;
  const periodEnd = new Date(periodStart);
  periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
  periodEnd.setUTCMonth(5);
  periodEnd.setUTCDate(30);
  const months =
    (periodEnd.getUTCFullYear() - used.getUTCFullYear()) * 12 +
    (periodEnd.getUTCMonth() - used.getUTCMonth()) +
    1;
  return Math.min(1, Math.max(1 / 12, months / 12));
}

export function computeForm2290Vehicles(
  vehicles: Form2290VehicleInput[],
  taxPeriodStart: string
): Form2290VehicleComputed[] {
  return vehicles.map((vehicle) => {
    const category = vehicle.suspensionClaimed ? "W" : grossWeightCategoryFromLbs(vehicle.grossWeightLbs);
    const annualTax = annualTaxForCategory(category);
    const factor = vehicle.suspensionClaimed ? 0 : partialYearTaxFactor(vehicle.firstUsedMonth, taxPeriodStart);
    const taxDue = Math.round(annualTax * factor * 100) / 100;
    return {
      ...vehicle,
      grossWeightCategory: category,
      annualTax,
      taxDue,
    };
  });
}

// ── Form 2290 HVUT due dates (SAF-F32) ─────────────────────────────────────────────────────────
//
// IRS rule: the return is due the LAST DAY OF THE MONTH FOLLOWING the month in which the vehicle was
// first used on public highways during the tax period (July 1 – June 30). Aug 31 is therefore only
// correct for a vehicle first used in JULY. A truck first used in November is due December 31, not
// the following August — this module previously returned Aug 31 for every unit regardless of first use,
// which under-reports the deadline for every mid-year acquisition.
//
// When that date falls on a Saturday, Sunday or legal holiday, the filing is timely on the next
// business day.

const MS_PER_DAY = 86_400_000;

function utc(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m, d));
}

/** nth (1-based) weekday of a month; nth = -1 means the LAST such weekday. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date {
  if (nth === -1) {
    const last = utc(year, month + 1, 0);
    const back = (last.getUTCDay() - weekday + 7) % 7;
    return utc(year, month, last.getUTCDate() - back);
  }
  const first = utc(year, month, 1);
  const forward = (weekday - first.getUTCDay() + 7) % 7;
  return utc(year, month, 1 + forward + (nth - 1) * 7);
}

/**
 * US federal holidays observed in `year`, as YYYY-MM-DD.
 *
 * Fixed-date holidays carry their OBSERVED date: a Saturday holiday is observed the preceding Friday
 * and a Sunday holiday the following Monday (5 U.S.C. 6103). That rule is why Dec 31 can be a holiday
 * at all — when Jan 1 falls on a Saturday, New Year's Day is observed on Dec 31 of the prior year,
 * and Dec 31 is a Form 2290 due date for vehicles first used in November.
 */
export function usFederalHolidays(year: number): Set<string> {
  const out = new Set<string>();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const observed = (d: Date) => {
    const day = d.getUTCDay();
    if (day === 6) return new Date(d.getTime() - MS_PER_DAY); // Saturday -> Friday
    if (day === 0) return new Date(d.getTime() + MS_PER_DAY); // Sunday -> Monday
    return d;
  };
  for (const [m, d] of [[0, 1], [5, 19], [6, 4], [10, 11], [11, 25]] as const) {
    out.add(iso(observed(utc(year, m, d))));
  }
  // A Jan 1 that falls on a Saturday is observed on Dec 31 of the PREVIOUS year — so next year's
  // New Year's Day can land inside this year's calendar. Without this, Dec 31 is missed.
  out.add(iso(observed(utc(year + 1, 0, 1))));
  out.add(iso(nthWeekdayOfMonth(year, 0, 1, 3)));   // MLK Jr — 3rd Monday of January
  out.add(iso(nthWeekdayOfMonth(year, 1, 1, 3)));   // Washington's Birthday — 3rd Monday of February
  out.add(iso(nthWeekdayOfMonth(year, 4, 1, -1)));  // Memorial Day — LAST Monday of May (can be May 31)
  out.add(iso(nthWeekdayOfMonth(year, 8, 1, 1)));   // Labor Day — 1st Monday of September
  out.add(iso(nthWeekdayOfMonth(year, 9, 1, 2)));   // Columbus Day — 2nd Monday of October
  out.add(iso(nthWeekdayOfMonth(year, 10, 4, 4)));  // Thanksgiving — 4th Thursday of November
  return out;
}

/** Roll forward off Saturdays, Sundays and federal holidays. */
export function nextBusinessDay(date: Date): Date {
  let d = new Date(date.getTime());
  // Recomputed per iteration: rolling off Dec 31 crosses into the next year's holiday set.
  for (let i = 0; i < 10; i += 1) {
    const day = d.getUTCDay();
    const isWeekend = day === 0 || day === 6;
    const isHoliday = usFederalHolidays(d.getUTCFullYear()).has(d.toISOString().slice(0, 10));
    if (!isWeekend && !isHoliday) return d;
    d = new Date(d.getTime() + MS_PER_DAY);
  }
  return d;
}

/**
 * PER-UNIT due date: last day of the month following first use, shifted off weekends/holidays.
 * `firstUse` is any YYYY-MM-DD in the month of first use.
 */
export function form2290DueDateForFirstUse(firstUse: string): string {
  const used = new Date(`${firstUse.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(used.getTime())) throw new Error(`form2290DueDateForFirstUse: invalid date ${firstUse}`);
  // Day 0 of month+2 is the last day of month+1 — the month FOLLOWING first use. Date normalises the
  // December rollover (month index 12 -> January of the next year) without a special case.
  const lastDayOfNextMonth = utc(used.getUTCFullYear(), used.getUTCMonth() + 2, 0);
  return nextBusinessDay(lastDayOfNextMonth).toISOString().slice(0, 10);
}

/**
 * The ANNUAL deadline — the one the compliance banner shows when no specific unit is in context.
 * It is the July-first-use case, i.e. Aug 31, now business-day shifted.
 *
 * getUTCMonth() is 0-indexed: July=6, August=7, September=8. During all of August the current year's
 * deadline is still today-or-future, so it remains upcoming; only from September (month > 7) has it
 * passed and we roll to next year. (`>= 7` here would bump the whole of August a year forward.)
 */
export function upcomingForm2290Deadline(reference = new Date()): { deadline: string; daysRemaining: number } {
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();
  const deadlineYear = month > 7 ? year + 1 : year;
  const deadline = nextBusinessDay(utc(deadlineYear, 7, 31));
  const daysRemaining = Math.ceil((deadline.getTime() - reference.getTime()) / MS_PER_DAY);
  return { deadline: deadline.toISOString().slice(0, 10), daysRemaining };
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function renderForm2290Pdf(input: {
  ein: string;
  companyName: string;
  taxPeriodStart: string;
  taxPeriodEnd: string;
  vehicles: Form2290VehicleComputed[];
  totalTaxDue: number;
}) {
  const scheduleRows = input.vehicles
    .map(
      (v) =>
        `<tr><td>${escapeHtml(v.vin)}</td><td>${escapeHtml(v.unitNumber)}</td><td>${v.grossWeightCategory}</td><td>$${v.taxDue.toFixed(2)}</td></tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<title>Form 2290 Draft</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 24px; color: #111; }
  h1 { font-size: 16px; } table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
  th { background: #f3f4f6; }
</style></head><body>
  <h1>IRS Form 2290 — Heavy Highway Vehicle Use Tax (Draft)</h1>
  <p><strong>${escapeHtml(input.companyName)}</strong> · EIN ${escapeHtml(input.ein)}</p>
  <p>Tax period: ${escapeHtml(input.taxPeriodStart)} through ${escapeHtml(input.taxPeriodEnd)}</p>
  <p>Total tax due: <strong>$${input.totalTaxDue.toFixed(2)}</strong></p>
  <h2>Schedule 1 — VIN list</h2>
  <table><thead><tr><th>VIN</th><th>Unit</th><th>Category</th><th>Tax</th></tr></thead><tbody>${scheduleRows}</tbody></table>
</body></html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true });
    return { pdfBuffer: Buffer.from(pdf), html };
  } finally {
    await browser.close();
  }
}
