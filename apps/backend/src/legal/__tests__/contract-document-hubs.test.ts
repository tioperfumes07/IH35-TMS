import { describe, expect, it } from "vitest";
import { contractHubs } from "../contract-document.service.js";

// ROUND 435 — a contract is filed at its HUB, decided by its own typed links (never a category name).
describe("contractHubs — where a filed contract PDF belongs", () => {
  it("a driver contract is filed in that driver's file", () => {
    expect(contractHubs({ driver_id: "d1" }, null)).toEqual([{ entity_type: "driver", entity_id: "d1" }]);
  });
  it("a driver signer with no typed FK still files to the driver", () => {
    expect(contractHubs({ signer_type: "driver", signer_entity_id: "d2" }, null)).toEqual([{ entity_type: "driver", entity_id: "d2" }]);
  });
  it("an insurance contract (carrier vendor) is filed on the vendor AND the carrier's first insurance bill", () => {
    expect(contractHubs({ vendor_id: "v1" }, "b1")).toEqual([
      { entity_type: "vendor", entity_id: "v1" },
      { entity_type: "bill", entity_id: "b1" },
    ]);
  });
  it("every typed link is a hub, each once", () => {
    const hubs = contractHubs({ customer_id: "c1", unit_id: "u1", equipment_id: "e1", load_id: "l1", signer_type: "customer", signer_entity_id: "c1" }, null);
    expect(hubs.map((h) => h.entity_type)).toEqual(["customer", "unit", "equipment", "load"]);
  });
  it("a contract with no links files only to itself (no invented hub)", () => {
    expect(contractHubs({}, null)).toEqual([]);
  });
});
