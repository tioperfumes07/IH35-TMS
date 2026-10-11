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
    await expect(refuseDuplicateProviderTransaction(client, { operatingCompanyId: CO, vendorId: VENDOR, reference: "99794138", fuelType: "diesel" })).rejects.toBeInstanceOf(
      FuelProviderTransactionDuplicateError
    );
  });
  it("does not even query for a reference that is not a provider key", async () => {
    const client = { query: vi.fn(async () => ({ rows: [{ id: "fuel-1" }] })) };
    await refuseDuplicateProviderTransaction(client, { operatingCompanyId: CO, vendorId: VENDOR, reference: "DEF-13534-1", fuelType: "def" });
    expect(client.query).not.toHaveBeenCalled();
  });
  it("lets a new provider ID through", async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };
    await expect(refuseDuplicateProviderTransaction(client, { operatingCompanyId: CO, vendorId: VENDOR, reference: "12345", fuelType: "diesel" })).resolves.toBeUndefined();
  });

  it("keys the provider ID per PRODUCT LINE — a DEF on the diesel's ticket is its own purchase (202615410930)", async () => {
    const client = { query: vi.fn(async (_sql: string, _v?: unknown[]) => ({ rows: [] as Array<Record<string, unknown>> })) };
    await refuseDuplicateProviderTransaction(client, { operatingCompanyId: CO, vendorId: VENDOR, reference: "99301244", fuelType: "def" });
    const [sql, values] = client.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/f\.fuel_type::text IS NOT DISTINCT FROM \$4::text/);
    expect(values[3]).toBe("def");
  });
  it("ROUND 443.28: a second product on the same ticket is its own row; diesel keeps its hash", () => {
    expect(enteredFuelRowHash(CO, VENDOR, "2870483", "diesel")).toBe(enteredFuelRowHash(CO, VENDOR, "2870483"));
    expect(enteredFuelRowHash(CO, VENDOR, "2870483", "def")).not.toBe(enteredFuelRowHash(CO, VENDOR, "2870483", "diesel"));
    expect(enteredFuelRowHash(CO, VENDOR, "2870483", "def")).toBe(enteredFuelRowHash(CO, VENDOR, " 2870483", "def"));
  });

  // 443.73 #6(d): the load suffix a re-feed hung on a receipt is not part of it — the second copy is refused.
  it("reads <invoice>-<load> as the receipt's own number, so the second copy of a purchase collides", () => {
    expect(providerTransactionId("99794138-13571")).toBe("99794138");
    expect(enteredFuelRowHash(CO, VENDOR, "99794138-13571")).toBe(enteredFuelRowHash(CO, VENDOR, "99794138"));
    expect(providerTransactionId("DEF-13571-1")).toBeNull();
    expect(providerTransactionId("99794138-2")).toBeNull();
  });
  it("finds a live copy stored under the suffixed reference (base compared to base)", async () => {
    const client = { query: vi.fn(async () => ({ rows: [{ id: "f1", load_id: "l1", load_number: "13557" }] })) };
    await expect(refuseDuplicateProviderTransaction(client, { operatingCompanyId: CO, vendorId: VENDOR, reference: "99794138-13571", fuelType: "diesel" })).rejects.toBeInstanceOf(
      FuelProviderTransactionDuplicateError
    );
    const [sql, values] = client.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/regexp_replace\(btrim\(f\.transaction_reference\), '-1\[0-9\]\{4\}\$', ''\) = \$3/);
    expect(values[2]).toBe("99794138");
  });
});
