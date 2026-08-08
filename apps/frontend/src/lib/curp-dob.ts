/**
 * Decode the date of birth encoded in a Mexican CURP, and check it against a supplied DOB.
 *
 * WHY THIS EXISTS (CC-2, 2026-08-07): prod had **188 drivers and 188 NULL dates of birth** — not one
 * driver in the system had one — while the create wizard happily accepted CURP
 * `MUGJ840525HTSXNR06`, which encodes 1984-05-25 in plain sight. **49 CFR 391.21(b)(2) requires the
 * employment application to carry "The applicant's name, address, date of birth, and social security
 * number"**, and 391.51(b)(1) requires that application in the driver qualification file. A DQF with
 * no DOB cannot support an MVR order, a Clearinghouse query, or a DOT age check.
 *
 * CURP LAYOUT (18 chars), positions 1-indexed:
 *   1-4   name-derived letters
 *   5-10  YYMMDD  ← the birth date
 *   11    sex, H or M
 *   12-13 state code
 *   14-16 internal consonants
 *   17    homoclave — a DIGIT for people born 1900-1999, a LETTER for 2000 and later
 *   18    check digit
 *
 * The century comes from position 17, not from a sliding window: a two-digit `84` is 1984 when
 * position 17 is a digit and 2084 would be nonsense. Guessing the century from "is YY > today" is the
 * usual bug and it silently mis-dates anyone born in an ambiguous year.
 */

export type CurpDob = { iso: string; year: number; month: number; day: number };

export function dobFromCurp(curp: string | null | undefined): CurpDob | null {
  if (!curp) return null;
  const c = curp.trim().toUpperCase();
  if (!/^[A-Z0-9]{18}$/.test(c)) return null;

  const yy = c.slice(4, 6);
  const mm = c.slice(6, 8);
  const dd = c.slice(8, 10);
  if (!/^\d{2}$/.test(yy) || !/^\d{2}$/.test(mm) || !/^\d{2}$/.test(dd)) return null;

  // Position 17 (index 16) carries the century: digit = 1900s, letter = 2000s.
  const homoclave = c[16];
  const century = /\d/.test(homoclave) ? 1900 : 2000;
  const year = century + Number(yy);
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Reject impossible calendar dates (31 February) rather than letting Date roll them forward.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }

  const iso = `${String(year).padStart(4, "0")}-${mm}-${dd}`;
  return { iso, year, month, day };
}

/**
 * Compare a typed DOB against the one the CURP encodes.
 *
 * Returns `null` when there is nothing to compare — no CURP, an unparseable CURP, or no DOB typed
 * yet. A mismatch is surfaced to the user as a WARNING, never a hard block: a CURP can legitimately
 * carry a clerical error from RENAPO, and refusing to save would strand a real driver. The point is
 * that the two disagree in front of a human who can decide, instead of one of them being silently
 * absent.
 */
export function curpDobMismatch(curp: string | null | undefined, dobIso: string | null | undefined): string | null {
  const decoded = dobFromCurp(curp);
  if (!decoded || !dobIso) return null;
  if (decoded.iso === dobIso.trim()) return null;
  return `CURP encodes ${decoded.iso}; date of birth entered is ${dobIso.trim()}`;
}
