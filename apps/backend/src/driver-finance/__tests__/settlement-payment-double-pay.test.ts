// Double-pay fix behavior pinning (FOUNDATION-FIRST Priority 2 / Phase 2).
//
// Pins the three safety properties restored from the deprecated payroll service
// (canonicalization-drop audit D2/D3/D4, docs/specs/SETTLEMENT-ENGINE-PHASE0-REVERIFY-2026-07-21.md §3):
//   1. loadSettlement takes the row lock (FOR UPDATE) in every mutator.
//   2. Every payment_state UPDATE carries the CAS predicate (IS NOT DISTINCT FROM the observed state).
//   3. A concurrency loser / double-click is an IDEMPOTENT SUCCESS that writes NO second
//      settlement_payment_events row and NO second audit row -- not a duplicate pay, not a false alarm.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  withCurrentUserMock: vi.fn(),
  withLuciaBypassMock: vi.fn(),
  appendCrudAuditMock: vi.fn(),
  sendEmailMock: vi.fn(),
  enqueueSyncJobMock: vi.fn(),
  resolveDefaultAchTokenMock: vi.fn(),
}));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: mocked.withCurrentUserMock,
  withLuciaBypass: mocked.withLuciaBypassMock,
}));
vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: mocked.appendCrudAuditMock,
}));
vi.mock("../../notifications/email.service.js", () => ({
  sendEmail: mocked.sendEmailMock,
}));
vi.mock("../../integrations/qbo/qbo-sync.service.js", () => ({
  enqueueSyncJob: mocked.enqueueSyncJobMock,
}));
vi.mock("../driver-payment-methods.service.js", () => ({
  resolveDefaultAchToken: mocked.resolveDefaultAchTokenMock,
}));

import {
  markCleared,
  markPaidManually,
  markSentToBank,
  queuePayment,
} from "../settlement-payment.service.js";

const OPCO = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const SID = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6073";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type Row = Record<string, unknown>;

function settlementRow(overrides: Row = {}): Row {
  return {
    id: SID,
    operating_company_id: OPCO,
    driver_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    status: "final",
    payment_state: "unpaid",
    payment_method: "check",
    payment_bank_reference: null,
    payment_release_idempotency_key: null,
    paid_at: null,
    ...overrides,
  };
}

/**
 * Scripted pg client: routes each query by SQL shape and records every call so the
 * tests can assert exactly which writes happened (and which did NOT).
 */
function scriptedClient(script: {
  lockedSelect?: Row | null;
  update?: Row | null;
  reread?: Row | null;
}) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values: values ?? [] });
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM driver_finance.driver_settlements") && sql.includes("FOR UPDATE")) {
        return { rows: script.lockedSelect ? [script.lockedSelect] : [] };
      }
      if (sql.includes("UPDATE driver_finance.driver_settlements")) {
        return { rows: script.update ? [script.update] : [] };
      }
      if (sql.includes("FROM driver_finance.driver_settlements")) {
        return { rows: script.reread ? [script.reread] : [] };
      }
      if (sql.includes("INSERT INTO driver_finance.settlement_payment_events")) return { rows: [] };
      return { rows: [] };
    }),
  };
  return { client, calls };
}

function eventInserts(calls: { sql: string }[]) {
  return calls.filter((c) => c.sql.includes("INSERT INTO driver_finance.settlement_payment_events"));
}
function stateUpdates(calls: { sql: string }[]) {
  return calls.filter((c) => c.sql.includes("UPDATE driver_finance.driver_settlements"));
}

beforeEach(() => {
  mocked.withCurrentUserMock.mockReset();
  mocked.withLuciaBypassMock.mockReset();
  mocked.appendCrudAuditMock.mockReset();
  mocked.sendEmailMock.mockReset();
  mocked.enqueueSyncJobMock.mockReset();
  mocked.resolveDefaultAchTokenMock.mockReset();
  mocked.resolveDefaultAchTokenMock.mockResolvedValue(null);
  mocked.enqueueSyncJobMock.mockResolvedValue(undefined);
  mocked.withLuciaBypassMock.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) =>
    fn({ query: vi.fn().mockResolvedValue({ rows: [] }) })
  );
});

function runInTx(client: unknown) {
  mocked.withCurrentUserMock.mockImplementation(
    async (_userId: string, fn: (c: unknown) => Promise<unknown>) => fn(client)
  );
}

describe("settlement-payment double-pay fix (D2/D3/D4)", () => {
  it("winner path: row lock + CAS predicate + keyed event insert (markPaidManually)", async () => {
    const updated = settlementRow({ payment_state: "manual_paid", payment_method: "cash", updated_at: "2026-07-21T00:00:00Z" });
    const { client, calls } = scriptedClient({ lockedSelect: settlementRow(), update: updated });
    runInTx(client);

    const result = await markPaidManually(SID, OPCO, "cash", "ref-1", USER);
    expect((result as Row).payment_state).toBe("manual_paid");

    const select = calls.find((c) => c.sql.includes("FOR UPDATE"));
    expect(select, "settlement lookup must take the row lock").toBeTruthy();

    const update = stateUpdates(calls)[0];
    expect(update.sql).toContain("payment_state IS NOT DISTINCT FROM");
    expect(update.sql).toContain("paid_at = COALESCE(paid_at, now())");
    // CAS is predicated on the RAW observed state (nullable), never the coerced value.
    expect(update.values).toContain("unpaid");

    const inserts = eventInserts(calls);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toContain("ON CONFLICT");
    expect(inserts[0].sql).toContain("DO NOTHING");
    const idemKey = inserts[0].values[5];
    expect(typeof idemKey).toBe("string");
    expect((idemKey as string).length).toBeGreaterThan(0);
    expect(mocked.appendCrudAuditMock).toHaveBeenCalledTimes(1);
  });

  it("CAS loser (0-row UPDATE) with row already in target = idempotent success, NO event, NO audit", async () => {
    const winnerRow = settlementRow({ payment_state: "manual_paid", paid_at: "2026-07-21T00:00:00Z" });
    const { client, calls } = scriptedClient({ lockedSelect: settlementRow(), update: null, reread: winnerRow });
    runInTx(client);

    const result = await markPaidManually(SID, OPCO, "cash", "ref-1", USER);
    expect((result as Row).payment_state).toBe("manual_paid");
    expect(eventInserts(calls)).toHaveLength(0);
    expect(mocked.appendCrudAuditMock).not.toHaveBeenCalled();
  });

  it("double-click observed under the lock (already in target + paid_at set) = idempotent success before any UPDATE", async () => {
    const { client, calls } = scriptedClient({
      lockedSelect: settlementRow({ payment_state: "manual_paid", paid_at: "2026-07-21T00:00:00Z" }),
    });
    runInTx(client);

    const result = await markPaidManually(SID, OPCO, "cash", "ref-1", USER);
    expect((result as Row).payment_state).toBe("manual_paid");
    expect(stateUpdates(calls)).toHaveLength(0);
    expect(eventInserts(calls)).toHaveLength(0);
    expect(mocked.appendCrudAuditMock).not.toHaveBeenCalled();
  });

  it("manual_paid with paid_at NULL heals paid_at without a second payment event", async () => {
    const healed = settlementRow({
      payment_state: "manual_paid",
      payment_method: "cash",
      paid_at: "2026-08-10T05:00:00Z",
    });
    const { client, calls } = scriptedClient({
      lockedSelect: settlementRow({ payment_state: "manual_paid", paid_at: null }),
      update: healed,
    });
    runInTx(client);

    const result = await markPaidManually(SID, OPCO, "cash", "ref-1", USER);
    expect((result as Row).paid_at).toBe("2026-08-10T05:00:00Z");
    const updates = stateUpdates(calls);
    expect(updates).toHaveLength(1);
    expect(updates[0].sql).toContain("paid_at = now()");
    expect(updates[0].sql).toContain("paid_at IS NULL");
    expect(eventInserts(calls)).toHaveLength(0);
    expect(mocked.appendCrudAuditMock).not.toHaveBeenCalled();
  });

  it("CAS loser with row in a DIFFERENT state = invalid_payment_state_transition (correct rejection)", async () => {
    const { client } = scriptedClient({
      lockedSelect: settlementRow({ payment_state: "queued" }),
      update: null,
      reread: settlementRow({ payment_state: "cleared" }),
    });
    runInTx(client);
    await expect(markPaidManually(SID, OPCO, "cash", null, USER)).rejects.toThrow("invalid_payment_state_transition");
  });

  it("illegal transition still rejected before any write (cleared -> queued)", async () => {
    const { client, calls } = scriptedClient({ lockedSelect: settlementRow({ payment_state: "cleared" }) });
    runInTx(client);
    await expect(queuePayment(SID, OPCO, USER)).rejects.toThrow("invalid_payment_state_transition");
    expect(stateUpdates(calls)).toHaveLength(0);
    expect(eventInserts(calls)).toHaveLength(0);
  });

  it("NULL payment_state coerces to unpaid and the CAS is predicated on NULL (IS NOT DISTINCT FROM)", async () => {
    const updated = settlementRow({ payment_state: "queued", payment_queued_at: "2026-07-21T00:00:00Z" });
    const { client, calls } = scriptedClient({
      lockedSelect: settlementRow({ payment_state: null }),
      update: updated,
    });
    runInTx(client);

    await queuePayment(SID, OPCO, USER);
    const update = stateUpdates(calls)[0];
    expect(update.sql).toContain("payment_state IS NOT DISTINCT FROM");
    // Raw NULL must be passed through so IS NOT DISTINCT FROM NULL matches the legacy row.
    expect(update.values[2]).toBeNull();
  });

  it("queuePayment mints a fresh rail release key per queue attempt", async () => {
    const updated = settlementRow({ payment_state: "queued", payment_queued_at: "2026-07-21T00:00:00Z" });
    const { client, calls } = scriptedClient({ lockedSelect: settlementRow(), update: updated });
    runInTx(client);

    await queuePayment(SID, OPCO, USER);
    const update = stateUpdates(calls)[0];
    expect(update.sql).toContain("payment_release_idempotency_key = $4");
    const key = update.values[3];
    expect(typeof key).toBe("string");
    expect((key as string).length).toBeGreaterThan(10);
  });

  it("markSentToBank REUSES the queued release key at the rail boundary (COALESCE, no overwrite)", async () => {
    const queuedRow = settlementRow({ payment_state: "queued", payment_release_idempotency_key: "release-key-1" });
    const sentRow = settlementRow({
      payment_state: "sent_to_bank",
      payment_release_idempotency_key: "release-key-1",
      payment_sent_at: "2026-07-21T00:00:00Z",
    });
    const { client, calls } = scriptedClient({ lockedSelect: queuedRow, update: sentRow });
    runInTx(client);

    await markSentToBank(SID, OPCO, "ACH-42", USER);
    const update = stateUpdates(calls)[0];
    expect(update.sql).toContain("COALESCE(payment_release_idempotency_key");
    const insert = eventInserts(calls)[0];
    expect(insert.values[3]).toContain("release-key-1"); // key surfaced in the event payload for the rail consumer
  });

  it("markCleared idempotent re-run does NOT enqueue a second QBO sync job", async () => {
    const { client } = scriptedClient({ lockedSelect: settlementRow({ payment_state: "cleared" }) });
    runInTx(client);
    await markCleared(SID, OPCO, USER);
    expect(mocked.enqueueSyncJobMock).not.toHaveBeenCalled();
  });
});
