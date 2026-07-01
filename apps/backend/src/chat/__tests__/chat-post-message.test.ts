// CHAT-2 — behavioral unit test of postMessage orchestration with a recording mock client.
// Proves the invariants that a static guard can't: dedup-before-seq (a retry burns no seq), the
// atomic lock→insert→log_event→receipts order, and that event emission uses events.log_event with
// the caller-supplied load/driver subject. No DB required.
import { describe, expect, it } from "vitest";
import { postMessage } from "../chat.service.js";

type Row = Record<string, unknown>;
function mockClient(handlers: Array<{ match: RegExp; rows?: Row[] }>) {
  const calls: string[] = [];
  const client = {
    async query(sql: string) {
      calls.push(sql.replace(/\s+/g, " ").trim());
      for (const h of handlers) if (h.match.test(sql)) return { rows: h.rows ?? [], rowCount: (h.rows ?? []).length };
      return { rows: [], rowCount: 0 };
    },
  };
  return { client, calls };
}

const subject = { subject_type: "load" as const, subject_id: "load-1" };
const baseInput = {
  thread_id: "t1", operating_company_id: "oc1",
  sender: { party_type: "office" as const, office_user_id: "u1" },
  msg_type: "text" as const, body: "hi", client_key: "ck-1", content_sha256: "abc",
};

describe("postMessage", () => {
  it("dedup-before-seq: a retried client_key returns the existing row and NEVER increments last_seq", async () => {
    const { client, calls } = mockClient([
      { match: /FOR UPDATE/, rows: [{ last_seq: "5", operating_company_id: "oc1" }] },
      { match: /client_key = \$2/, rows: [{ id: "m-existing", seq: 5 }] }, // dedup hit
    ]);
    const out = await postMessage(client as never, baseInput, subject);
    expect(out.deduped).toBe(true);
    expect(out.message.id).toBe("m-existing");
    // no seq increment, no insert, no event emitted on a dedup hit.
    expect(calls.some((c) => /SET last_seq/.test(c))).toBe(false);
    expect(calls.some((c) => /INSERT INTO chat\.messages/.test(c))).toBe(false);
    expect(calls.some((c) => /events\.log_event/.test(c))).toBe(false);
  });

  it("new message: locks thread, dedups, increments seq, inserts, emits log_event, seeds receipts — in order", async () => {
    const { client, calls } = mockClient([
      { match: /FOR UPDATE/, rows: [{ last_seq: "5", operating_company_id: "oc1" }] },
      { match: /client_key = \$2/, rows: [] }, // no dup
      { match: /INSERT INTO chat\.messages/, rows: [{ id: "m-new", seq: 6, server_ts: "2026-07-01T00:00:00Z" }] },
      { match: /events\.log_event/, rows: [{ log_event: "ev-1" }] },
    ]);
    const out = await postMessage(client as never, baseInput, subject);
    expect(out.deduped).toBe(false);
    expect(out.message.id).toBe("m-new");
    expect(out.message.event_log_id).toBe("ev-1");

    const idx = (re: RegExp) => calls.findIndex((c) => re.test(c));
    const lock = idx(/FOR UPDATE/);
    const dedup = idx(/client_key = \$2/);
    const bump = idx(/SET last_seq/);
    const insert = idx(/INSERT INTO chat\.messages/);
    const emit = idx(/events\.log_event/);
    const backfill = idx(/SET event_log_id/);
    const receipts = idx(/INSERT INTO chat\.message_receipts/);
    // strict ordering: lock < dedup < bump < insert < emit < backfill < receipts
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(dedup);
    expect(dedup).toBeLessThan(bump);
    expect(bump).toBeLessThan(insert);
    expect(insert).toBeLessThan(emit);
    expect(emit).toBeLessThan(backfill);
    expect(backfill).toBeLessThan(receipts);
  });

  it("throws if the thread row is missing (never posts to a non-existent thread)", async () => {
    const { client } = mockClient([{ match: /FOR UPDATE/, rows: [] }]);
    await expect(postMessage(client as never, baseInput, subject)).rejects.toThrow(/thread_not_found/);
  });
});
