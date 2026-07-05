import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACCOUNTING_DEAD_LETTER_AFTER,
  computeAccountingBackoffIsoAfterIncrement,
  shouldDeadLetterAccountingAttempt,
} from "../sync-outbound-accounting.js";

describe("computeAccountingBackoffIsoAfterIncrement", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses min(60 * 2^(n+1), 3600) seconds from incremented logical attempt", () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-05-12T12:00:00.000Z").getTime());
    const iso = computeAccountingBackoffIsoAfterIncrement(0);
    expect(iso).toBe(new Date("2026-05-12T12:02:00.000Z").toISOString());
  });

  it("caps at one hour", () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-05-12T12:00:00.000Z").getTime());
    const iso = computeAccountingBackoffIsoAfterIncrement(12);
    expect(iso).toBe(new Date("2026-05-12T13:00:00.000Z").toISOString());
  });
});

describe("shouldDeadLetterAccountingAttempt — G10-H4 generic-catch retry cap", () => {
  it("keeps retrying below the dead-letter threshold", () => {
    // attempt_count before this try = 0,1,2 → nextAttempts 1,2,3 (< 5) → still retry, not dead-letter
    expect(shouldDeadLetterAccountingAttempt(0)).toBe(false);
    expect(shouldDeadLetterAccountingAttempt(1)).toBe(false);
    expect(shouldDeadLetterAccountingAttempt(2)).toBe(false);
  });

  it("dead-letters once the threshold is reached instead of retrying forever", () => {
    // A non-transient error (e.g. missing-id / build failure) hitting the generic catch must stop.
    // attempt_count before this try = 4 → nextAttempts 5 (>= ACCOUNTING_DEAD_LETTER_AFTER) → dead-letter.
    expect(shouldDeadLetterAccountingAttempt(ACCOUNTING_DEAD_LETTER_AFTER - 1)).toBe(true);
    expect(shouldDeadLetterAccountingAttempt(ACCOUNTING_DEAD_LETTER_AFTER)).toBe(true);
    expect(shouldDeadLetterAccountingAttempt(50)).toBe(true);
  });

  it("bounds a negative/garbage attempt count to the retry side (never mis-dead-letters attempt 0)", () => {
    expect(shouldDeadLetterAccountingAttempt(-3)).toBe(false);
  });

  it("uses the SAME threshold the known HTTP-error branches use (no separate cap for unknown errors)", () => {
    // The last attempt that still retries and the first that dead-letters straddle the single constant.
    expect(shouldDeadLetterAccountingAttempt(ACCOUNTING_DEAD_LETTER_AFTER - 2)).toBe(false);
    expect(shouldDeadLetterAccountingAttempt(ACCOUNTING_DEAD_LETTER_AFTER - 1)).toBe(true);
  });
});
