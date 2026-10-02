import { describe, expect, it } from "vitest";
import {
  LINK_TARGETS,
  mergeLinks,
  signerLinks,
  typedForeignKeys,
  linksFromInstanceRow,
  parseContractUnlinkedReason,
  parseMatterUnlinkedReason,
  matterHasSubjectFk,
  MATTER_UNLINKED_REASON_PREFIX,
} from "../contract-linkage.service.js";
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

describe("ROUND 326 linkage sync helpers", () => {
  it("linksFromInstanceRow prefers typed FKs and fills from signer", () => {
    const links = linksFromInstanceRow({
      signer_type: "driver",
      signer_entity_id: "D1",
      unit_id: "U9",
    });
    expect(links.driver_id).toBe("D1");
    expect(links.unit_ids).toEqual(["U9"]);
  });
  it("parses contract + matter unlinked reasons", () => {
    expect(parseContractUnlinkedReason({ _linkage_unlinked_reason: "source PDF names no party" })).toBe(
      "source PDF names no party"
    );
    expect(parseMatterUnlinkedReason(`${MATTER_UNLINKED_REASON_PREFIX} no subject in source`)).toBe("no subject in source");
    expect(matterHasSubjectFk({ related_driver_id: "D1" })).toBe(true);
    expect(matterHasSubjectFk({})).toBe(false);
  });
});

describe("matter reserve", () => {
  it("posts only the change since the last posted reserve", () => {
    expect(reserveDelta(500000, null)).toBe(500000);
    expect(reserveDelta(300000, 500000)).toBe(-200000);
    expect(reserveDelta(500000, 500000)).toBe(0);
  });
});
