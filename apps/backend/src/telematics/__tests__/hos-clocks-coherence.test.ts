import { describe, expect, it } from "vitest";
import { hosClocksCoherent } from "../hos-clocks.service.js";

describe("hosClocksCoherent (false-violation killer)", () => {
  it("rejects the GAYTAN case: drove the full 11h (drive=0) but break clock untouched (brk=459) = gapped stream", () => {
    expect(hosClocksCoherent({ drive_remaining_min: 0, window_remaining_min: 0, break_remaining_min: 459 })).toBe(false);
  });

  it("rejects a fully-consumed 14h window with an essentially-untouched break", () => {
    expect(hosClocksCoherent({ drive_remaining_min: 120, window_remaining_min: 0, break_remaining_min: 450 })).toBe(false);
  });

  it("accepts a normal mid-shift clock set", () => {
    expect(hosClocksCoherent({ drive_remaining_min: 369, window_remaining_min: 468, break_remaining_min: 300 })).toBe(true);
  });

  it("accepts a REAL violation (drive=0 AND break=0) — a coherent exhausted set still shows the violation", () => {
    // drove 11h and the break clock is also exhausted -> coherent -> the violation MUST still render.
    expect(hosClocksCoherent({ drive_remaining_min: 0, window_remaining_min: 0, break_remaining_min: 0 })).toBe(true);
  });
});
