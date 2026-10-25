import { describe, expect, it } from "vitest";
import { layoutBays, type BayWorkOrder } from "../shop-bays.routes.js";

// LEAD 443.301 · register row 59 — bays 1..N from the company setting; occupied work orders land in their bay.
const wo = (bay: number | null, id = `wo-${bay}`): BayWorkOrder => ({
  work_order_id: id, display_id: null, status: "in_progress", unit_id: null, unit_number: null, title: null,
  bay_number: bay, bay_assigned_at: bay ? "2026-10-24T00:00:00Z" : null, in_shop_at: null, expected_release_at: null,
});

describe("layoutBays (row 59)", () => {
  it("renders exactly bay_count bays, numbered from 1, empty when nothing occupies them", () => {
    const bays = layoutBays(4, []);
    expect(bays.map((b) => b.bay_number)).toEqual([1, 2, 3, 4]);
    expect(bays.every((b) => b.work_order === null)).toBe(true);
  });
  it("places each occupied work order in its own bay and leaves the rest open", () => {
    const bays = layoutBays(4, [wo(3), wo(1)]);
    expect(bays.map((b) => b.work_order?.work_order_id ?? null)).toEqual(["wo-1", null, "wo-3", null]);
  });
  it("follows the setting, not a literal 4", () => {
    expect(layoutBays(6, [wo(6)]).map((b) => b.work_order?.work_order_id ?? null)).toEqual([null, null, null, null, null, "wo-6"]);
  });
});
