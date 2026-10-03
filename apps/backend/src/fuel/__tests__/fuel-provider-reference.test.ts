import { describe, expect, it, vi } from "vitest";
import {
  enteredFuelRowHash,
  FuelProviderTransactionDuplicateError,
  providerTransactionId,
  refuseDuplicateProviderTransaction,
} from "../fuel-provider-reference.js";

// ROUND 367.2 — one provider transaction is one fuel purchase. The live USMCA shapes: 255 digits-only provider IDs and
// 65 references that are not a key (placeholders and parse fragments), which must never be deduplicated on.
const CO = "11111111-1111-4111-8111-111111111111";
const VENDOR = "22222222-2222-4222-8222-222222222222";

describe("providerTransactionId", () => {
  it("is the provider's digits, trimmed", () => {
    expect(providerTransactionId(" 99794138 ")).toBe("99794138");
  });
  it.each(["DEF-13534-1", "nofuelinv-5772-3", "ustFluid", "101 PINNACLE ROAD", "62.410", "", null, undefined])(
    "%s is not a provider key",
    (ref) => expect(providerTransactionId(ref as string | null | undefined)).toBeNull()
  );
});

describe("enteredFuelRowHash", () => {
  it("keys a provider ID on company + vendor + ID, so a second entry collides", () => {
    expect(enteredFuelRowHash(CO, VENDOR, "1848853")).toBe(enteredFuelRowHash(CO, VENDOR, " 1848853"));
  });
  it("gives a line with no provider key its own hash (never NULL, never a false collision)", () => {
    expect(enteredFuelRowHash(CO, VENDOR, "ustFluid")).not.toBe(enteredFuelRowHash(CO, VENDOR, "ustFluid"));
  });
});

describe("refuseDuplicateProviderTransaction", () => {
  it("refuses by name when a live row already records the provider ID", async () => {
    const client = { query: vi.fn(async () => ({ rows: [{ id: "fuel-1", load_id: "l-1", load_number: "13557" }] })) };
    await expect(refuseDuplicateProviderTransaction(client, { operatingCompanyId: CO, vendorId: VENDOR, reference: "99794138" })).rejects.toBeInstanceOf(
      FuelProviderTransactionDuplicateError
    );
  });
  it("does not even query for a reference that is not a provider key", async () => {
    const client = { query: vi.fn(async () => ({ rows: [{ id: "fuel-1" }] })) };
    await refuseDuplicateProviderTransaction(client, { operatingCompanyId: CO, vendorId: VENDOR, reference: "DEF-13534-1" });
    expect(client.query).not.toHaveBeenCalled();
  });
  it("lets a new provider ID through", async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };
    await expect(refuseDuplicateProviderTransaction(client, { operatingCompanyId: CO, vendorId: VENDOR, reference: "12345" })).resolves.toBeUndefined();
  });
});
