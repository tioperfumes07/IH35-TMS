import { describe, expect, it } from "vitest";
import { normalizePickedEntityPhoneToE164 } from "./phone-format";

/**
 * LEGAL-F5988 regression coverage.
 *
 * Live-reproduced 2026-08-22: selecting driver "Isaac Carballo Roque" (mdata.drivers.phone =
 * bare "8307036834", written by the CSV bulk-import path which bypasses the CRUD route's E.164
 * enforcement) in the Unified Contract Creator auto-fills Signer phone with that raw value.
 * "Create & send" then 400s at POST /api/v1/legal/contracts — contracts.service.ts's
 * signer_phone regex is `/^\+\d{10,15}$/` — with a toast that quotes the raw regex and names no
 * field, giving the operator nothing to act on for a value they never typed.
 */
describe("normalizePickedEntityPhoneToE164", () => {
  it("prefixes +1 onto a bare 10-digit US number (the reproduced live case)", () => {
    expect(normalizePickedEntityPhoneToE164("8307036834")).toBe("+18307036834");
  });

  it("strips formatting punctuation before normalizing", () => {
    expect(normalizePickedEntityPhoneToE164("(830) 703-6834")).toBe("+18307036834");
  });

  it("passes an already-valid E.164 value through unchanged", () => {
    expect(normalizePickedEntityPhoneToE164("+19565550822")).toBe("+19565550822");
  });

  it("accepts an 11-digit number with a leading country digit 1", () => {
    expect(normalizePickedEntityPhoneToE164("18307036834")).toBe("+18307036834");
  });

  it("returns empty for null/undefined/blank rather than a value guaranteed to fail validation", () => {
    expect(normalizePickedEntityPhoneToE164(null)).toBe("");
    expect(normalizePickedEntityPhoneToE164(undefined)).toBe("");
    expect(normalizePickedEntityPhoneToE164("   ")).toBe("");
  });

  it("returns empty for a length it can't confidently normalize, instead of guessing", () => {
    expect(normalizePickedEntityPhoneToE164("12345")).toBe("");
    expect(normalizePickedEntityPhoneToE164("123456789012345678")).toBe("");
  });
});
