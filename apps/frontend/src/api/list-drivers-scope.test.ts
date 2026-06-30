import * as client from "./client";
import { listDrivers } from "./mdata";
import { beforeEach, describe, expect, it, vi } from "vitest";

// REGRESSION GUARD (DRIVERPROFILE-1): the /mdata/drivers roster read is entity-scoped — calling it
// WITHOUT operating_company_id fail-closes to 0 rows and silently empties the Driver roster. The
// param is now a REQUIRED key at the type level; this test pins that a passed company id reaches the
// query string, so a future refactor that drops it from the URL fails loudly here.
describe("listDrivers carries operating_company_id", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("includes operating_company_id in the request URL", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ drivers: [], total: 0 } as never);
    await listDrivers({ operating_company_id: "11111111-1111-1111-1111-111111111111", status: "All", limit: 200 });
    const url = String(spy.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("/api/v1/mdata/drivers");
    expect(url).toContain("operating_company_id=11111111-1111-1111-1111-111111111111");
  });

  it("omits the param when company id is null (caller gates with `enabled`)", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ drivers: [], total: 0 } as never);
    await listDrivers({ operating_company_id: null, status: "Active" });
    const url = String(spy.mock.calls[0]?.[0] ?? "");
    expect(url).not.toContain("operating_company_id");
  });
});
