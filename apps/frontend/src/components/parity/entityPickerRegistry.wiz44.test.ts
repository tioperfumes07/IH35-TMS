import { describe, expect, it, vi, beforeEach } from "vitest";

// WIZ-44 GUARD (owner ruling 2026-09-04). The Book Load driver picker offered ANGEL ALFONSO SOSA's
// MERGED/deactivated row (deactivated tonight by CC-3's 33-pair merge) while the form's re-resolve
// then rejected it — "This driver record was merged — reselect." — so Save did nothing and load
// 13508 kept assigned_primary_driver_id = NULL. Root cause: the entity picker registry (the single
// surface every driver/unit/trailer/customer/vendor picker flows through) never filtered on the
// canonical liveness column. VOID-COLUMN 2026-09-03: selectable ⇔ deactivated_at IS NULL, never
// status. This guard mocks each master-data list API to return one LIVE + one DEACTIVATED row and
// asserts every picker kind drops the deactivated id. It fails on the pre-fix registry (no filter).
const listMocks = vi.hoisted(() => ({
  listCustomers: vi.fn(),
  listDrivers: vi.fn(),
  listEquipment: vi.fn(),
  listUnits: vi.fn(),
  listVendors: vi.fn(),
}));

vi.mock("../../api/mdata", () => listMocks);
vi.mock("../../api/loads", () => ({ listLoads: vi.fn() }));
vi.mock("../../api/maintenance", () => ({ listWorkOrders: vi.fn() }));
vi.mock("../../api/insurance", () => ({
  listInsuranceClaims: vi.fn(),
  listInsuranceLawsuits: vi.fn(),
  listInsurancePolicies: vi.fn(),
}));
vi.mock("../../api/accounting", () => ({ listFactoringAdvances: vi.fn() }));
vi.mock("../../api/legal-matters", () => ({ legalMattersApi: { list: vi.fn() } }));

import { getEntityPickerConfig } from "./entityPickerRegistry";

const COMPANY = "22222222-2222-2222-2222-222222222222";
const LIVE = "11111111-1111-1111-1111-111111111111";
const DEAD = "2ee70f40-0000-0000-0000-000000000000"; // the merged/deactivated shape from load 13508

beforeEach(() => {
  // status is deliberately the SAME live-looking value on both rows — only deactivated_at differs,
  // reproducing the merge that left status untouched while setting deactivated_at.
  listMocks.listDrivers.mockResolvedValue({
    drivers: [
      { id: LIVE, first_name: "Angel", last_name: "Sosa", status: "Active", deactivated_at: null },
      { id: DEAD, first_name: "Angel", last_name: "Sosa", status: "Active", deactivated_at: "2026-09-04T04:00:00Z" },
    ],
  });
  listMocks.listCustomers.mockResolvedValue({
    customers: [
      { id: LIVE, name: "Live Customer", customer_code: "LC", status: "active", deactivated_at: null },
      { id: DEAD, name: "Merged Customer", customer_code: "MC", status: "active", deactivated_at: "2026-09-04T04:00:00Z" },
    ],
  });
  listMocks.listUnits.mockResolvedValue({
    units: [
      { id: LIVE, unit_number: "T100", deactivated_at: null },
      { id: DEAD, unit_number: "T100", deactivated_at: "2026-09-04T04:00:00Z" },
    ],
  });
  listMocks.listEquipment.mockResolvedValue({
    equipment: [
      { id: LIVE, equipment_number: "TR1", deactivated_at: null },
      { id: DEAD, equipment_number: "TR1", deactivated_at: "2026-09-04T04:00:00Z" },
    ],
  });
  listMocks.listVendors.mockResolvedValue({
    vendors: [
      { id: LIVE, name: "Live Vendor", vendor_type: "factoring", deactivated_at: null },
      { id: DEAD, name: "Merged Vendor", vendor_type: "factoring", deactivated_at: "2026-09-04T04:00:00Z" },
    ],
  });
});

describe("WIZ-44 — entity pickers never offer a deactivated (merged) option", () => {
  for (const kind of ["driver", "customer", "unit", "trailer", "vendor"] as const) {
    it(`${kind} picker drops rows with deactivated_at set (keeps only the live survivor)`, async () => {
      const options = await getEntityPickerConfig(kind).list(COMPANY, { search: "Angel" });
      const ids = options.map((o) => o.value);
      expect(ids).toContain(LIVE);
      expect(ids).not.toContain(DEAD);
    });
  }
});
