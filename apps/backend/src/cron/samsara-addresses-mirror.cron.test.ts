import { beforeEach, describe, expect, it, vi } from "vitest";

// ROUND 443.38 item 3: the Samsara address mirror is refreshed on a schedule (it froze at 2026-10-01 because nothing did).

const queries: string[] = [];
const fakeClient = { query: vi.fn(async (sql: string) => { queries.push(sql); return { rows: [] }; }) };
const mirror = vi.fn(async (_c: unknown, _co: string, raw: unknown[]) => raw.length);
const tenants = vi.fn(async () => ["5c854333-6ea5-4faa-af31-67cb272fef80"]);

vi.mock("../auth/db.js", () => ({ withLuciaBypass: async (fn: (c: unknown) => unknown) => fn(fakeClient) }));
vi.mock("../integrations/samsara/ingestion-tenants.service.js", () => ({ listSamsaraIngestionTenantIds: () => tenants() }));
vi.mock("../integrations/samsara/geofences/geofence-address-link.service.js", () => ({
  mirrorSamsaraAddresses: (c: unknown, co: string, raw: unknown[]) => mirror(c, co, raw),
}));

const { runSamsaraAddressesMirrorTick } = await import("./samsara-addresses-mirror.cron.js");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const addr = (id: string) => ({ id, raw: { id, name: `A${id}` } });

describe("Samsara address mirror refresh (443.38)", () => {
  beforeEach(() => { queries.length = 0; mirror.mockClear(); });

  it("upserts every ingestion tenant's addresses, scoped to that company", async () => {
    const out = await runSamsaraAddressesMirrorTick(async () => [addr("1"), addr("2"), addr("3")]);
    expect(out).toEqual([{ operating_company_id: USMCA, written: 3 }]);
    expect(mirror).toHaveBeenCalledWith(fakeClient, USMCA, expect.any(Array));
    expect(queries.some((q) => q.includes("set_config('app.operating_company_id'"))).toBe(true);
  });

  it("an unconfigured tenant is skipped, nothing written", async () => {
    const out = await runSamsaraAddressesMirrorTick(async () => null);
    expect(out).toEqual([{ operating_company_id: USMCA, skipped: "samsara_not_configured" }]);
    expect(mirror).not.toHaveBeenCalled();
  });

  it("an empty Samsara answer fails the tick and leaves the mirror untouched", async () => {
    await expect(runSamsaraAddressesMirrorTick(async () => [])).rejects.toThrow(/0 addresses/);
    expect(mirror).not.toHaveBeenCalled();
  });
});
