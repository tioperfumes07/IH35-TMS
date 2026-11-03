/**
 * E1 / row 162 (LEAD 11-03) — a Relay fill takes its driver from Relay's own id first (directly or through
 * integrations.relay_driver_links), before the fuel row's driver or the load at fill time; NULL only; audited.
 * Fail-old: 262 of 281 fills had no driver — the matcher read one id per driver and 0 drivers carried one.
 */
import { describe, expect, it, vi } from "vitest";

const audit = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("../../../audit/crud-audit.js", () => ({
  appendCrudAudit: async (...args: unknown[]) => { audit.calls.push(args); },
}));
vi.mock("../relay-fuel-load-rematch.service.js", () => ({ rematchRelayFuelLoads: async () => ({ scanned: 0 }) }));

import { rematchRelayFuelDrivers } from "../relay-fuel-driver-rematch.service.js";

type Q = { sql: string; values: unknown[] };

function client(opts: { linkDriver: string | null; fuelDriver: string | null }) {
  const qs: Q[] = [];
  return {
    qs,
    query: async (sql: string, values: unknown[] = []) => {
      qs.push({ sql, values });
      if (/FROM integrations\.relay_fuel_transactions\s+WHERE matched_driver_id IS NULL/.test(sql))
        return { rows: [{ id: "r1", operating_company_id: "c", transaction_id: "txn_1", relay_driver_integration_id: "8029341864741314", matched_unit_id: "u1", relay_created_at: "2026-10-01 10:00:00+00" }] };
      if (/FROM mdata\.drivers\s+WHERE operating_company_id = \$1::uuid\s+AND integration_id = \$2/.test(sql)) return { rows: [] };
      if (/integrations\.relay_driver_links/.test(sql)) return { rows: opts.linkDriver ? [{ id: opts.linkDriver, active: true }] : [] };
      if (/FROM fuel\.fuel_transactions ft/.test(sql)) return { rows: opts.fuelDriver ? [{ driver_id: opts.fuelDriver }] : [] };
      if (/UPDATE integrations\.relay_fuel_transactions/.test(sql)) return { rows: [], rowCount: 1 };
      if (/UPDATE fuel\.fuel_transactions/.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [] };
    },
  };
}

describe("E1 rematchRelayFuelDrivers", () => {
  it("Relay's own id (link table) wins over the fuel row's driver", async () => {
    audit.calls = [];
    const c = client({ linkDriver: "angel", fuelDriver: "luis" });
    const r = await rematchRelayFuelDrivers(c as never, { operating_company_id: "c" });
    expect(r.relay_updated).toBe(1);
    const up = c.qs.find((q) => /UPDATE integrations\.relay_fuel_transactions/.test(q.sql))!;
    expect(up.values[0]).toBe("angel");
    expect(up.sql).toMatch(/AND matched_driver_id IS NULL/);
    expect(audit.calls[0]?.[2]).toBe("relay.fill_driver_matched");
    expect((audit.calls[0]?.[3] as { source: string }).source).toBe("integration_id");
  });
  it("without a link, the fuel row's driver is used and labelled", async () => {
    audit.calls = [];
    const c = client({ linkDriver: null, fuelDriver: "luis" });
    await rematchRelayFuelDrivers(c as never, { operating_company_id: "c" });
    expect((audit.calls[0]?.[3] as { source: string }).source).toBe("fuel_row");
  });
  it("never overwrites a fuel row's driver", async () => {
    const c = client({ linkDriver: "angel", fuelDriver: null });
    await rematchRelayFuelDrivers(c as never, { operating_company_id: "c" });
    const fu = c.qs.find((q) => /UPDATE fuel\.fuel_transactions/.test(q.sql))!;
    expect(fu.sql).toMatch(/AND driver_id IS NULL/);
  });
});
