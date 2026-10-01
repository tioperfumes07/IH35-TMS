import { describe, expect, it } from "vitest";
import { LINK_TARGETS, mergeLinks, signerLinks, typedForeignKeys } from "../contract-linkage.service.js";
import { reserveDelta } from "../matters.service.js";

describe("contract linkage (§10-B)", () => {
  it("the signer's own FK comes from signer_type", () => {
    expect(signerLinks("vendor", "V1")).toEqual({ vendor_id: "V1" });
    expect(signerLinks("customer", "C1")).toEqual({ customer_id: "C1" });
    expect(signerLinks("driver", "D1")).toEqual({ driver_id: "D1" });
    expect(signerLinks("company", "K1")).toEqual({ counterparty_company_id: "K1" });
    expect(signerLinks("other", "X")).toEqual({});
  });
  it("merges signer + requested links; units / trailers stay many, first fills the typed FK", () => {
    const m = mergeLinks({ vendor_id: "V1" }, { unit_ids: ["U1", "U2"], equipment_ids: ["E1"], lease_contract_id: "L1", bill_ids: ["B1"] });
    expect(m.vendor_id).toBe("V1");
    expect(m.unit_ids).toEqual(["U1", "U2"]);
    expect(typedForeignKeys(m)).toMatchObject({ vendor_id: "V1", unit_id: "U1", equipment_id: "E1", lease_contract_id: "L1" });
  });
  it("every link target is entity-scoped", () => {
    for (const [k, t] of Object.entries(LINK_TARGETS)) {
      if (k === "counterparty_company_id") continue;
      expect(t.scope).toMatch(/\$2::uuid|user_accessible_company_ids/);
    }
    expect(LINK_TARGETS.unit_ids.scope).toMatch(/user_accessible_company_ids/);
  });
});

describe("matter reserve", () => {
  it("posts only the change since the last posted reserve", () => {
    expect(reserveDelta(500000, null)).toBe(500000);
    expect(reserveDelta(300000, 500000)).toBe(-200000);
    expect(reserveDelta(500000, 500000)).toBe(0);
  });
});
