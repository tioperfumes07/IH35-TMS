/**
 * ACCT-F11121 — the auto-status engine snapshots only real units, and only for USMCA (Transportation / Trucking frozen).
 * Prod 11-09: last success 2026-11-03 16:05Z; every tick since failed on auto_status_position_snapshots_unit_uuid_fkey
 * because 10 cached positions belonged to units purged 11-03.
 */
import { describe, expect, it, vi } from "vitest";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const TRANSP = "11111111-1111-4111-8111-111111111111";
const calls: Array<{ sql: string; params?: unknown[] }> = [];

vi.mock("../../auth/db.js", () => ({
  withLuciaBypass: async (fn: (c: unknown) => Promise<unknown>) =>
    fn({
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        if (/FROM org\.companies/.test(sql)) return { rows: [{ id: TRANSP }, { id: USMCA }] };
        return { rows: [] };
      },
    }),
}));
vi.mock("../../lib/single-flight.js", () => ({ tryXactSingleFlight: async () => true }));
vi.mock("../../cron/_helpers/tenant-context-guard.js", () => ({ assertTenantContext: () => undefined }));

import { runAutoStatusSwitchTick } from "../auto-status-switch-worker.js";
import { recordPositionSnapshotsForCompany } from "../../integrations/samsara/auto-status-switch/detector.service.js";

describe("ACCT-F11121 auto-status engine", () => {
  it("processes USMCA only — never a frozen entity", async () => {
    calls.length = 0;
    const summary = await runAutoStatusSwitchTick();
    expect(summary.companies_processed).toBe(1);
    const scoped = calls.filter((c) => /set_config\('app\.operating_company_id'/.test(c.sql)).map((c) => c.params?.[0]);
    expect(scoped).toEqual([USMCA]);
  });

  it("reads cached positions only for units that exist (JOIN mdata.units)", async () => {
    const seen: string[] = [];
    await recordPositionSnapshotsForCompany(
      { query: async (sql: string) => (seen.push(sql), { rows: [] }) } as never,
      USMCA,
    );
    expect(seen[0]).toMatch(/FROM integrations\.samsara_vehicle_positions p\s+JOIN mdata\.units u ON u\.id = p\.unit_uuid/);
  });
});
