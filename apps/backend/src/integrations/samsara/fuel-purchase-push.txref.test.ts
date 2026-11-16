import { describe, expect, it } from "vitest";
import { OUR_PAYLOAD_FORMAT_REASON, samsaraTransactionReference } from "./fuel-purchase-push.service.js";

// E-23, measured live 2026-11-16 00:00Z: Samsara rejected every push — transactionReference must be <= 32 chars, we sent 36.
describe("E-23 Samsara fuel purchase transactionReference", () => {
  it("is the fuel transaction UUID's 32 hex digits — within Samsara's limit and mapping back to one row", () => {
    const id = "027bdeee-532b-4cb4-bdf0-30f59dbefdca";
    const ref = samsaraTransactionReference(id);
    expect(ref).toBe("027bdeee532b4cb4bdf030f59dbefdca");
    expect(ref.length).toBe(32);
    expect(ref.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5")).toBe(id);
  });
  it("our old reference-length rejection is not a permanent failure of the row", () => {
    expect(OUR_PAYLOAD_FORMAT_REASON.test('samsara_fuel_purchase_http_400:length of body.transactionReference must be lesser or equal than 32 but got value "x" (len=36):http_400')).toBe(true);
    expect(OUR_PAYLOAD_FORMAT_REASON.test("samsara_fuel_purchase_http_400: vehicle not found:http_400")).toBe(false);
  });
});
