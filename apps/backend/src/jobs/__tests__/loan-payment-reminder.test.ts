/**
 * LOAN-09 — reminder emission: dedupe semantics and scan exclusions.
 *
 * The two things that can go wrong here are both silent:
 *   1. A daily sweep re-notifying the same payment every day until it is due. Nothing errors, the
 *      channel just becomes noise and people stop reading it — so the one reminder that matters is the
 *      one nobody opens.
 *   2. Reminding about a payment that is already paid, on a voided loan, or already overdue. Each puts
 *      a false or misleading liability in front of the owner.
 * Both are asserted here rather than trusted to the SQL reading correctly at a glance.
 */
import { describe, expect, it } from "vitest";

import { enqueueOutboxEvent } from "../../outbox/enqueue-outbox-event.js";
import { findSchedulesDueSoon, reminderDedupeKey, LOAN_PAYMENT_DUE_EVENT, REMINDER_LEAD_DAYS } from "../loan-payment-reminder-worker.js";

type Call = { sql: string; values: unknown[] };

function mockClient(rowsFor: (sql: string) => Array<Record<string, unknown>>) {
  const calls: Call[] = [];
  return {
    calls,
    client: {
      query: async <T>(sql: string, values?: unknown[]) => {
        calls.push({ sql, values: values ?? [] });
        return { rows: rowsFor(sql) as T[] };
      },
    },
  };
}

describe("LOAN-09 reminder dedupe", () => {
  it("keys the dedupe on the SCHEDULE ROW, not the loan — each payment gets its own reminder", () => {
    // Keying on loan_id would send ONE reminder for the whole loan and then go silent for every
    // remaining payment. Keying on the schedule row is what makes payment 2 remind after payment 1.
    expect(reminderDedupeKey("sched-1")).not.toBe(reminderDedupeKey("sched-2"));
    expect(reminderDedupeKey("sched-1")).toContain(LOAN_PAYMENT_DUE_EVENT);
    expect(reminderDedupeKey("sched-1")).toContain("sched-1");
  });

  it("reports enqueued=false when the dedupe key already exists (no second notification)", async () => {
    // ON CONFLICT DO NOTHING returns no row; the caller must read that as "already reminded" rather
    // than as a failure, and must not count it as a fresh notification.
    const { client, calls } = mockClient(() => []);
    /* outbox-handler-parity: literal-types=["accounting.related_party_loan.payment_due"] */
    const res = await enqueueOutboxEvent(
      client,
      LOAN_PAYMENT_DUE_EVENT,
      { aggregate_type: "accounting.related_party_loan_entries", aggregate_id: "loan-1" },
      { due_date: "2026-08-10" },
      reminderDedupeKey("sched-1")
    );
    expect(res.enqueued).toBe(false);
    expect(calls[0]?.sql).toContain("ON CONFLICT (dedupe_key)");
    // The partial index predicate must be named or Postgres cannot use it as the arbiter.
    expect(calls[0]?.sql).toContain("WHERE dedupe_key IS NOT NULL");
  });

  it("reports enqueued=true on a first insert", async () => {
    const { client } = mockClient(() => [{ id: "evt-1" }]);
    /* outbox-handler-parity: literal-types=["accounting.related_party_loan.payment_due"] */
    const res = await enqueueOutboxEvent(
      client,
      LOAN_PAYMENT_DUE_EVENT,
      { aggregate_type: "accounting.related_party_loan_entries", aggregate_id: "loan-1" },
      { due_date: "2026-08-10" },
      reminderDedupeKey("sched-1")
    );
    expect(res.enqueued).toBe(true);
  });

  it("writes NO dedupe_key when none is supplied — existing callers keep their behaviour", async () => {
    // test.noop rather than an invented type: verify-outbox-handler-parity requires every emitted type
    // to have a registered handler, and it is right to — an event with no consumer is marked FAILED by
    // the processor. A fake type here would have been a fake emitter in the guard's eyes.
    const { client, calls } = mockClient(() => []);
    const res = await enqueueOutboxEvent(
      client,
      "test.noop",
      { aggregate_type: "mdata.loads", aggregate_id: "load-1" },
      {}
    );
    expect(res.enqueued).toBe(true);
    expect(calls[0]?.sql).not.toContain("dedupe_key");
  });

  it("folds the aggregate identity into the payload so a delivered event stays actionable", async () => {
    const { client, calls } = mockClient(() => [{ id: "evt-1" }]);
    /* outbox-handler-parity: literal-types=["accounting.related_party_loan.payment_due"] */
    await enqueueOutboxEvent(
      client,
      LOAN_PAYMENT_DUE_EVENT,
      { aggregate_type: "accounting.related_party_loan_entries", aggregate_id: "loan-9" },
      { due_date: "2026-08-10" },
      reminderDedupeKey("sched-1")
    );
    const body = JSON.parse(String(calls[0]?.values[1]));
    expect(body.aggregate_id).toBe("loan-9");
    expect(body.due_date).toBe("2026-08-10");
  });
});

describe("LOAN-09 scan exclusions", () => {
  it("excludes paid, voided and overdue rows, and scopes to the entity", async () => {
    const { client, calls } = mockClient(() => []);
    await findSchedulesDueSoon(client, "11111111-1111-4111-8111-111111111111", REMINDER_LEAD_DAYS);
    const sql = calls[0]!.sql;

    // Already paid — a reminder would send someone chasing a settled payment.
    expect(sql).toContain("NOT s.posted");
    // void-not-delete keeps voided rows forever; a voided loan is not a debt.
    expect(sql).toContain("e.reversed_at IS NULL");
    expect(sql).toContain("e.deleted_at IS NULL");
    expect(sql).toContain("s.deleted_at IS NULL");
    // OVERDUE is a different fact needing a different message — folding it into "due soon" would
    // understate a missed payment.
    expect(sql).toContain("s.due_date >= CURRENT_DATE");
    // Entity isolation on BOTH tables: joining the entry without scoping it would let a TRANSP sweep
    // read a USMCA loan's counterparty.
    expect(sql).toContain("s.operating_company_id = $1::uuid");
    expect(sql).toContain("e.operating_company_id = s.operating_company_id");

    expect(calls[0]!.values[0]).toBe("11111111-1111-4111-8111-111111111111");
    expect(calls[0]!.values[1]).toBe(REMINDER_LEAD_DAYS);
  });

  it("uses a lead window long enough to survive a weekend", () => {
    // Shorter than a full week and a Friday reminder for a Monday payment leaves no working day to act.
    expect(REMINDER_LEAD_DAYS).toBeGreaterThanOrEqual(7);
  });
});

describe("LOAN-09 handler registration", () => {
  it("has a REGISTERED handler for the event it emits", async () => {
    // enqueue-outbox-event.ts states the rule this pins: an event enqueued with no registered handler
    // is not ignored — the processor marks it FAILED. So emitting this type without registering a
    // consumer would turn every reminder into a failed outbox row and notify nobody. This asserts the
    // producer and the consumer agree on the exact string, which a rename would otherwise break
    // silently in one direction only.
    const { buildOutboxHandlerRegistry } = await import("../../outbox/handlers/registry.js");
    const registry = buildOutboxHandlerRegistry();
    expect(registry.has(LOAN_PAYMENT_DUE_EVENT)).toBe(true);
  });
});
