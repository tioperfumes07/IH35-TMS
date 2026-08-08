import * as client from "./client";
import { getDriver } from "./mdata";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * REGRESSION GUARD — LV-DRIVER-DETAIL-PAGE-CRASHES (P0, go-live blocker).
 *
 * THE BUG: `GET /api/v1/mdata/drivers/:id` has TWO response shapes. When `operating_company_id` is
 * present it returns the AGGREGATE ENVELOPE `{ driver, license, medical_card, ... }`
 * (drivers.routes.ts — driverAggregateQuerySchema requires the uuid, so the branch is taken); with no
 * company it returns the FLAT driver row. `getDriver` ALWAYS sends the company id, so it always got
 * the envelope — while every caller reads FLAT fields off it.
 *
 * Consequence: `driverQuery.data.phone` was `undefined`, and DriverDetail.tsx:693 called
 * `.replace()` on it at render-top, so the driver profile threw
 * "Cannot read properties of undefined (reading 'replace')" and rendered NOTHING — taking the whole
 * driver-qualification file (license, medical, documents, drug test, permits) and document upload
 * with it. It was NOT entity-specific and NOT data-dependent: `phone` is populated for every driver
 * in the database, and the field was undefined because it sat one level deeper in the payload.
 *
 * FIVE MORE SURFACES were silently degraded rather than crashing, which is why nobody caught it:
 * DriverAutocomplete (name fell back to the raw uuid), DriverHosDetailPage (subtitle rendered
 * "undefined undefined"), CreateWOSectionIdentification (driver last name blank on a work order),
 * CreateMultipleBillsPage and DriverLayoverHistoryPage. One API-client bug, six broken surfaces.
 *
 * The fix unwraps the envelope in the ONE shared client rather than teaching six call sites about it,
 * and tolerates BOTH shapes so the non-aggregate path keeps working. These tests pin both directions.
 */
describe("getDriver unwraps the aggregate envelope (LV-DRIVER-DETAIL-PAGE-CRASHES)", () => {
  const companyId = "11111111-1111-1111-1111-111111111111";
  const flat = { id: "d1", first_name: "Jorge", last_name: "Munoz", phone: "+528671040205" };

  beforeEach(() => vi.restoreAllMocks());

  it("returns the inner driver when the backend sends the aggregate envelope", async () => {
    vi.spyOn(client, "apiRequest").mockResolvedValue({
      driver: flat,
      license: { cdl_number: "X" },
      medical_card: {},
      documents: [],
    } as never);
    const driver = await getDriver("d1", companyId);
    // The exact field whose absence threw at DriverDetail.tsx:693.
    expect(driver.phone).toBe("+528671040205");
    expect(driver.first_name).toBe("Jorge");
  });

  it("still returns the row when the backend sends the FLAT shape", async () => {
    vi.spyOn(client, "apiRequest").mockResolvedValue(flat as never);
    const driver = await getDriver("d1", companyId);
    expect(driver.phone).toBe("+528671040205");
  });

  it("does not mistake a driver whose own field is called `driver` for an envelope", async () => {
    // Defensive: unwrapping keys on the presence of a `driver` OBJECT, so a flat row that happens to
    // carry a scalar `driver` field is not silently replaced by it.
    vi.spyOn(client, "apiRequest").mockResolvedValue({ ...flat, driver: "not-an-object" } as never);
    const driver = await getDriver("d1", companyId);
    expect(driver.phone).toBe("+528671040205");
  });
});
