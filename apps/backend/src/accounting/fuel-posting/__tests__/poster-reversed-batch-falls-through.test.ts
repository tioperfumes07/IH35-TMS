// LEAD 443.203 (ACCT-F4432033) — the fuel poster never hands back a REVERSED journal entry as "already posted".
// Relay fill txn_CWhET7bpU861jH: its original batch still says batch_status='posted', but the batch's JE was reversed
// (443.129 E) and re-posted under a ':correction:r1' key. On main resolveExistingPostedResult returned the reversed JE;
// the Settlement Creator then adopted a dead entry (0 live legs) and refused settlement 5847.
import { describe, expect, it, vi } from "vitest";
import { findPostedFuelEvent, postFuelExpenseOnClient } from "../poster.service.js";

vi.mock("../fuel-item-account.js", async (orig) => {
  const actual = await orig<typeof import("../fuel-item-account.js")>();
  return {
    ...actual,
    resolveFuelItem: async () => ({ itemId: "item-fuel", expenseAccountId: "acct-5000", itemName: "item:diesel" }),
  };
});

const OC = "11111111-1111-4111-8111-111111111111";
const FILL = "249c2831-b572-425d-9dda-9d4f4d91b0b8";
const ORIG_BATCH = "d2183d68-0000-4000-8000-000000000001";
const ORIG_JE = "683c941f-0000-4000-8000-000000000001"; // reversed by 49d784b2
const LIVE_BATCH = "5cd7d855-batch-4000-8000-000000000001";
const LIVE_JE = "5cd7d855-0000-4000-8000-000000000001"; // the ':correction:r1' re-post

/** A fake client: the original batch is 'posted' but its JE is reversed; `liveReceipt` says whether a live posting exists. */
function client(opts: { liveReceipt: boolean; origStanding?: boolean }) {
  const calls: string[] = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push(sql);
    if (sql.includes("fuel.fuel_receipt_postings")) {
      return { rows: opts.liveReceipt ? [{ posting_batch_id: LIVE_BATCH, idempotency_key: "fuel:x:correction:r1" }] : [] };
    }
    if (sql.includes("FROM accounting.posting_batches")) return { rows: [{ id: ORIG_BATCH, batch_status: "posted" }] };
    if (sql.includes("FROM accounting.journal_entry_postings")) {
      const batch = values?.[1];
      const standingOnly = sql.includes("reversed_by_je_id IS NULL");
      if (batch === LIVE_BATCH) return { rows: [{ posting_id: "jep-live-1", journal_entry_uuid: LIVE_JE }, { posting_id: "jep-live-2", journal_entry_uuid: LIVE_JE }] };
      if (batch === ORIG_BATCH) {
        if (standingOnly && !opts.origStanding) return { rows: [] };
        return { rows: [{ posting_id: "jep-orig-1", journal_entry_uuid: ORIG_JE }, { posting_id: "jep-orig-2", journal_entry_uuid: ORIG_JE }] };
      }
    }
    if (sql.includes("closed_period_cutoff")) return { rows: [{ cutoff: null }] };
    return { rows: [] };
  });
  return { query, calls };
}

const input = {
  operating_company_id: OC,
  actor_user_id: "22222222-2222-4222-8222-222222222222",
  fuel_event_id: FILL,
  fuel_kind: "diesel" as const,
  posted_at: "2026-09-20T12:00:00.000Z",
  amount_cents: 53548,
  posting_path: "company_direct" as const,
  company_direct_credit: "relay_fuel_wallet" as const,
};

describe("fuel poster — a reversed batch is not an existing posting (443.203)", () => {
  it("batch posted, its JE reversed, a live correction posting exists -> returns the LIVE entry, never the reversed one", async () => {
    const c = client({ liveReceipt: true });
    const r = await postFuelExpenseOnClient(c as never, input as never);
    expect(r.result).toBe("already_posted");
    expect(r.journal_entry_id).toBe(LIVE_JE);
    expect(r.journal_entry_id).not.toBe(ORIG_JE);
    expect(c.calls.some((s) => s.includes("INSERT INTO accounting."))).toBe(false);
  });

  it("batch posted, its JE reversed, NO live posting -> refuses; never returns the reversed JE, never posts again", async () => {
    const c = client({ liveReceipt: false });
    await expect(postFuelExpenseOnClient(c as never, input as never)).rejects.toThrow(/fuel_posting_refused_reversed_no_live_posting/);
    expect(c.calls.some((s) => s.includes("INSERT INTO accounting."))).toBe(false);
  });

  it("batch posted and its JE STANDS -> adopted as before (no regression)", async () => {
    const c = client({ liveReceipt: false, origStanding: true });
    const r = await postFuelExpenseOnClient(c as never, input as never);
    expect(r.journal_entry_id).toBe(ORIG_JE);
    expect(r.posting_batch_id).toBe(ORIG_BATCH);
  });

  it("findPostedFuelEvent (bank match) — reversed batch falls through to the live receipt posting", async () => {
    const live = await findPostedFuelEvent(client({ liveReceipt: true }) as never, OC, FILL);
    expect(live?.journal_entry_id).toBe(LIVE_JE);
    const none = await findPostedFuelEvent(client({ liveReceipt: false }) as never, OC, FILL);
    expect(none).toBeNull();
  });
});

// 443.203 follow-up (5847 rehearsal on prod): two shapes the first fix still refused.
describe("fuel poster — the fill's live posting is found when the registry points at the reversed original (443.203 b)", () => {
  it("registry row on the REVERSED original, the ':correction:r1' batch never registered -> returns the correction (newest standing batch of the same fill)", async () => {
    const calls: string[] = [];
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push(sql);
      if (sql.includes("fuel.fuel_receipt_postings")) return { rows: [{ posting_batch_id: ORIG_BATCH, idempotency_key: "fuel:x" }] };
      if (sql.includes("FROM accounting.posting_batches b") && sql.includes("source_transaction_id")) return { rows: [{ id: LIVE_BATCH, idempotency_key: "fuel:x:correction:r1" }, { id: ORIG_BATCH, idempotency_key: "fuel:x" }] };
      if (sql.includes("FROM accounting.posting_batches")) return { rows: [{ id: ORIG_BATCH, batch_status: "posted" }] };
      if (sql.includes("FROM accounting.journal_entry_postings")) {
        if (values?.[1] === LIVE_BATCH) return { rows: [{ posting_id: "jep-live-1", journal_entry_uuid: LIVE_JE }] };
        return { rows: [] }; // the original no longer stands
      }
      if (sql.includes("closed_period_cutoff")) return { rows: [{ cutoff: null }] };
      return { rows: [] };
    });
    const r = await postFuelExpenseOnClient({ query } as never, input as never);
    expect(r.journal_entry_id).toBe(LIVE_JE);
    expect(calls.some((q) => q.includes("INSERT INTO accounting."))).toBe(false);
  });

  it("a line the RECLASSIFY engine moved (applied reclassify_batch_lines) does not take the batch out of standing", async () => {
    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql);
      if (sql.includes("fuel.fuel_receipt_postings")) return { rows: [] };
      if (sql.includes("FROM accounting.posting_batches")) return { rows: [{ id: ORIG_BATCH, batch_status: "posted" }] };
      if (sql.includes("FROM accounting.journal_entry_postings")) {
        // the standing query must exempt reclassify-moved lines; answer "stands" only when it does
        return sql.includes("reclassify_batch_lines") ? { rows: [{ posting_id: "jep-orig-1", journal_entry_uuid: ORIG_JE }] } : { rows: [] };
      }
      if (sql.includes("closed_period_cutoff")) return { rows: [{ cutoff: null }] };
      return { rows: [] };
    });
    const r = await postFuelExpenseOnClient({ query } as never, input as never);
    expect(r.journal_entry_id).toBe(ORIG_JE);
  });
});
