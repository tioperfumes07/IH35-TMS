// IFTA quarter helpers.
//
// BUG FIX (COMP-1): the IFTA preparer used to default to the CURRENT calendar
// quarter computed at click time (`Math.floor(getUTCMonth()/3)+1`). IFTA returns
// are filed the month AFTER a quarter closes — Q1 (Jan–Mar) is due April 30 — so
// clicking "Prepare" in April used to derive Q2 and file the WRONG quarter.
//
// The correct DEFAULT target is the most-recently-closed quarter (the one being
// filed), and the user can override it via a selector. These are pure functions so
// the "April -> Q1" behavior is unit-testable.

export type QuarterNumber = 1 | 2 | 3 | 4;
export type QuarterYear = { quarter: QuarterNumber; year: number };

/**
 * The quarter currently being FILED = the most recently CLOSED calendar quarter
 * (i.e. one quarter before `now`). Filing Q1 happens during April, so in April this
 * returns Q1, NOT the current calendar quarter (Q2).
 */
export function filingQuarter(now: Date = new Date()): QuarterYear {
  // Shift back one quarter (3 months) from the current UTC month, then truncate.
  const shifted = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  const quarter = (Math.floor(shifted.getUTCMonth() / 3) + 1) as QuarterNumber;
  return { quarter, year: shifted.getUTCFullYear() };
}

export function toQuarterLabel(qy: QuarterYear): string {
  return `${qy.year}-Q${qy.quarter}`;
}

export function parseQuarterLabel(label: string): QuarterYear {
  const match = label.trim().match(/^(\d{4})-Q([1-4])$/i);
  if (!match) throw new Error("invalid_quarter_label");
  return { year: Number(match[1]), quarter: Number(match[2]) as QuarterNumber };
}

export function filingQuarterLabel(now: Date = new Date()): string {
  return toQuarterLabel(filingQuarter(now));
}

/**
 * Recent quarters (most recent first) for a target-quarter selector, starting at
 * the current filing quarter and walking back `count` quarters.
 */
export function recentQuarterOptions(count = 8, now: Date = new Date()): QuarterYear[] {
  const start = filingQuarter(now);
  const out: QuarterYear[] = [];
  let q: number = start.quarter;
  let y = start.year;
  for (let i = 0; i < count; i += 1) {
    out.push({ quarter: q as QuarterNumber, year: y });
    q -= 1;
    if (q < 1) {
      q = 4;
      y -= 1;
    }
  }
  return out;
}
