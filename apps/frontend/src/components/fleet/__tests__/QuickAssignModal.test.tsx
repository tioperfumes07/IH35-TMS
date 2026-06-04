import { describe, expect, it } from "vitest";
import type { QuickAssignTarget } from "../QuickAssignModal";
import { QuickAssignModal } from "../QuickAssignModal";

describe("QuickAssignModal", () => {
  it("exports a modal component", () => {
    expect(typeof QuickAssignModal).toBe("function");
    expect(QuickAssignModal.name).toBe("QuickAssignModal");
  });

  it("accepts truck quick-assign targets", () => {
    const target: QuickAssignTarget = {
      equipmentKind: "truck",
      equipmentId: "00000000-0000-0000-0000-000000000001",
      equipmentLabel: "Truck 101",
    };
    expect(target.equipmentKind).toBe("truck");
  });

  it("accepts trailer quick-assign targets", () => {
    const target: QuickAssignTarget = {
      equipmentKind: "trailer",
      equipmentId: "00000000-0000-0000-0000-000000000002",
      equipmentLabel: "Trailer 220",
    };
    expect(target.equipmentKind).toBe("trailer");
  });
});
