import { describe, expect, it, vi } from "vitest";

import {
  DriftAlertError,
  detectSessionVarianceDrift,
  resolveDriftAlert,
  runDriftDetectors,
} from "../drift-alerts.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BANK_ACCOUNT_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "22222222-2222-2222-2222-222222222222";
const ALERT_ID = "33333333-3333-3333-3333-333333333333";

// A tiny in-memory fake: one finalized session, one bank account, driven by a mutable "state" so a
// test can flip the session from above-tolerance to within-tolerance between two detector runs and
// watch the alert open then auto-close, exactly like the GUARD spec describes.
function makeClient(state: { variance_cents: number; open_alert_id: string | null }) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      if (/FROM banking\.reconciliation_sessions rs\s+JOIN banking\.bank_accounts/.test(sql)) {
        return {
          rows: [
            {
              session_id: SESSION_ID,
              bank_account_id: BANK_ACCOUNT_ID,
              period_end: "2026-09-01",
              statement_balance_cents: "1000000",
              book_balance_cents: String(1000000 - state.variance_cents),
              variance_cents: String(state.variance_cents),
              drift_tolerance_cents: 100,
            },
          ],
        };
      }
      if (/SELECT id FROM banking\.reconciliation_drift_alerts/.test(sql)) {
        return state.open_alert_id ? { rows: [{ id: state.open_alert_id }] } : { rows: [] };
      }
      if (/INSERT INTO banking\.reconciliation_drift_alerts/.test(sql)) {
        state.open_alert_id = ALERT_ID;
        return { rows: [] };
      }
      if (/UPDATE banking\.reconciliation_drift_alerts[\s\S]*SET bank_balance_cents/.test(sql)) {
        return { rows: [] }; // refresh of an already-open alert
      }
      if (/SELECT id, bank_account_id::text AS bank_account_id\s+FROM banking\.reconciliation_drift_alerts/.test(sql)) {
        return state.open_alert_id ? { rows: [{ id: state.open_alert_id, bank_account_id: BANK_ACCOUNT_ID }] } : { rows: [] };
      }
      if (/UPDATE banking\.reconciliation_drift_alerts[\s\S]*resolved_at = now\(\),\s*resolved_by_user_id = NULL/.test(sql)) {
        state.open_alert_id = null;
        return { rows: [] };
      }
      // live_balance / stale_feed sub-queries this suite doesn't exercise — return empty so they
      // are no-ops for the session_variance-focused tests below.
      if (/FROM banking\.bank_accounts\s+WHERE operating_company_id = \$1::uuid AND is_active = true AND ledger_account_id IS NOT NULL/.test(sql)) {
        return { rows: [] };
      }
      if (/FROM banking\.bank_accounts\s+WHERE operating_company_id = \$1::uuid AND is_active = true\s+AND \(last_synced_at/.test(sql)) {
        return { rows: [] };
      }
      return { rows: [] };
    }),
  };
  return { client, calls };
}

describe("banking drift alerts — GO-20 slice A GUARD spec", () => {
  // GUARD bullet 1: "A test that finalizes a session with a variance above tolerance and asserts
  // one alert opens; brings it back inside tolerance and asserts it closes with a reason."
  it("opens one alert when variance exceeds tolerance, then auto-closes it with a reason once back in tolerance", async () => {
    const state = { variance_cents: 5000, open_alert_id: null as string | null }; // $50.00 vs $1.00 tolerance
    const { client: client1 } = makeClient(state);
    const first = await detectSessionVarianceDrift(client1 as never, OPCO);
    expect(first.opened).toBe(1);
    expect(first.closed).toBe(0);
    expect(state.open_alert_id).toBe(ALERT_ID);

    // Re-running while still above tolerance must NOT open a second alert (uq_liability... err,
    // uq_drift_open_per_account_kind is the real guard on the DB side; this proves the app-side
    // idempotent-reuse path matches it).
    const { client: client1b } = makeClient(state);
    const second = await detectSessionVarianceDrift(client1b as never, OPCO);
    expect(second.opened).toBe(0);

    // Now the variance clears (back within the $1.00 tolerance).
    state.variance_cents = 50; // $0.50, within $1.00 tolerance
    const { client: client2, calls: calls2 } = makeClient(state);
    const third = await detectSessionVarianceDrift(client2 as never, OPCO);
    expect(third.closed).toBe(1);
    expect(state.open_alert_id).toBeNull();
    const closeCall = calls2.find((c) => /resolved_by_user_id = NULL/.test(c.sql));
    expect(closeCall).toBeTruthy();
    expect(closeCall!.sql).toMatch(/resolution_note = 'Auto-closed/);
  });

  // GUARD bullet 2: "A test asserting the detector never writes to accounting.journal_entries."
  it("never writes to accounting.journal_entries in any detector pass", async () => {
    const state = { variance_cents: 5000, open_alert_id: null as string | null };
    const { client, calls } = makeClient(state);
    await runDriftDetectors(client as never, OPCO);
    expect(calls.some((c) => /accounting\.journal_entries/.test(c.sql))).toBe(false);
    expect(calls.some((c) => /INSERT INTO accounting/.test(c.sql))).toBe(false);
  });

  it("resolve requires a non-empty note", async () => {
    const state = { variance_cents: 5000, open_alert_id: ALERT_ID };
    const { client } = makeClient(state);
    // resolveDriftAlert reads the alert row directly; give it a shape query response too.
    client.query = vi.fn(async (sql: string) => {
      if (/SELECT id, resolved_at::text/.test(sql)) {
        return { rows: [{ id: ALERT_ID, resolved_at: null, voided_at: null }] };
      }
      return { rows: [] };
    }) as never;

    await expect(
      resolveDriftAlert(client as never, {
        operating_company_id: OPCO,
        alert_id: ALERT_ID,
        resolved_by_user_id: "user-1",
        note: "  ",
      })
    ).rejects.toMatchObject({ code: "resolution_note_required" });

    const result = await resolveDriftAlert(client as never, {
      operating_company_id: OPCO,
      alert_id: ALERT_ID,
      resolved_by_user_id: "user-1",
      note: "Confirmed with the bank, timing difference, cleared next day.",
    });
    expect(result.resolved).toBe(true);
  });

  it("resolve refuses a second resolution of the same alert", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (/SELECT id, resolved_at::text/.test(sql)) {
          return { rows: [{ id: ALERT_ID, resolved_at: "2026-09-01T00:00:00Z", voided_at: null }] };
        }
        return { rows: [] };
      }),
    };
    await expect(
      resolveDriftAlert(client as never, {
        operating_company_id: OPCO,
        alert_id: ALERT_ID,
        resolved_by_user_id: "user-1",
        note: "already resolved once",
      })
    ).rejects.toMatchObject({ code: "drift_alert_already_resolved" });
  });

  it("DriftAlertError is a real Error subclass carrying a stable .code", () => {
    const err = new DriftAlertError("some_code", "some message");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("some_code");
  });
});
