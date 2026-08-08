import { describe, expect, it } from "vitest";
import { curpDobMismatch, dobFromCurp } from "./curp-dob";

/**
 * DQF-P0. The live case that opened this: driver 49427973 was saved with CURP MUGJ840525HTSXNR06 and
 * date_of_birth NULL — and prod had 188 drivers with 188 NULL dates of birth, so not one driver could
 * support an MVR order, a Clearinghouse query or a DOT age check (49 CFR 391.21(b)(2) / 391.51(b)(1)).
 */
describe("dobFromCurp", () => {
  it("decodes the live driver's CURP to 1984-05-25", () => {
    expect(dobFromCurp("MUGJ840525HTSXNR06")?.iso).toBe("1984-05-25");
  });

  it("uses position 17 for the century, not a sliding window", () => {
    // Digit homoclave → 1900s. `84` must be 1984, never 2084.
    expect(dobFromCurp("MUGJ840525HTSXNR06")?.year).toBe(1984);
    // Letter homoclave → 2000s. Same YY, different century, and a year-window heuristic gets this wrong.
    expect(dobFromCurp("MUGJ840525HTSXNRA6")?.year).toBe(2084);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(dobFromCurp("  mugj840525htsxnr06  ")?.iso).toBe("1984-05-25");
  });

  it("returns null rather than guessing on malformed input", () => {
    expect(dobFromCurp(null)).toBeNull();
    expect(dobFromCurp("")).toBeNull();
    expect(dobFromCurp("TOOSHORT")).toBeNull();
    expect(dobFromCurp("MUGJ84AB25HTSXNR06")).toBeNull(); // non-numeric date block
  });

  it("rejects an impossible calendar date instead of letting Date roll it forward", () => {
    // 31 February would silently become 2 or 3 March via the Date constructor.
    expect(dobFromCurp("MUGJ840231HTSXNR06")).toBeNull();
    expect(dobFromCurp("MUGJ841301HTSXNR06")).toBeNull(); // month 13
  });
});

describe("curpDobMismatch", () => {
  it("is silent when the two agree", () => {
    expect(curpDobMismatch("MUGJ840525HTSXNR06", "1984-05-25")).toBeNull();
  });

  it("reports both dates when they disagree", () => {
    const msg = curpDobMismatch("MUGJ840525HTSXNR06", "1984-05-26");
    expect(msg).toContain("1984-05-25");
    expect(msg).toContain("1984-05-26");
  });

  it("has nothing to say when either side is missing or unparseable", () => {
    expect(curpDobMismatch(null, "1984-05-25")).toBeNull();
    expect(curpDobMismatch("MUGJ840525HTSXNR06", null)).toBeNull();
    expect(curpDobMismatch("GARBAGE", "1984-05-25")).toBeNull();
  });
});
