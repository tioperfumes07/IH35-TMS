import { describe, expect, it } from "vitest";
import { decryptPlaidAccessToken, encryptPlaidAccessToken } from "../plaid-token-crypto.js";

describe("plaid-token-crypto (G10-H5)", () => {
  it("round-trips an encrypted token", () => {
    const plain = "access-production-11111111-2222-3333-4444-555555555555";
    const enc = encryptPlaidAccessToken(plain);
    expect(enc).not.toBe(plain);
    expect(enc.startsWith("access-")).toBe(false);
    expect(decryptPlaidAccessToken(enc)).toBe(plain);
  });

  it("produces a fresh IV per call (ciphertext differs, plaintext recovers)", () => {
    const plain = "access-sandbox-abcdef";
    const a = encryptPlaidAccessToken(plain);
    const b = encryptPlaidAccessToken(plain);
    expect(a).not.toBe(b);
    expect(decryptPlaidAccessToken(a)).toBe(plain);
    expect(decryptPlaidAccessToken(b)).toBe(plain);
  });

  it("returns legacy plaintext tokens unchanged (no data migration needed)", () => {
    const legacy = "access-production-legacy-plaintext-token";
    expect(decryptPlaidAccessToken(legacy)).toBe(legacy);
  });

  it("tolerates a non-envelope value by treating it as plaintext", () => {
    const junk = "not-an-envelope-value";
    expect(decryptPlaidAccessToken(junk)).toBe(junk);
  });

  it("passes through null", () => {
    expect(decryptPlaidAccessToken(null)).toBeNull();
    expect(decryptPlaidAccessToken(undefined)).toBeNull();
  });
});
