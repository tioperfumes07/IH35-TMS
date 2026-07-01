// CHAT-7 — offline outbox behavior. Proves the durability guarantees: a queued message survives,
// dedups on client_key, flushes oldest-first, and a failed send STOPS the flush (stays queued).
import { beforeEach, describe, expect, it, vi } from "vitest";

// vitest env is 'node' here — provide a minimal in-memory localStorage. chatOutbox reads it lazily
// (inside functions), so setting it at module eval is enough for the static import below.
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}
(globalThis as unknown as { localStorage: Storage }).localStorage = new MemStorage() as unknown as Storage;

import { enqueue, list, pendingCount, remove, flush, type OutboxItem } from "../chatOutbox";

const mk = (client_key: string, created_at: number, body = "hi", thread_id = "t1"): OutboxItem => ({ thread_id, body, client_key, created_at });

describe("chatOutbox", () => {
  beforeEach(() => localStorage.clear());

  it("enqueues and dedups on client_key", () => {
    enqueue(mk("ck1", 1));
    enqueue(mk("ck1", 2)); // same key → no dup
    enqueue(mk("ck2", 3));
    expect(pendingCount()).toBe(2);
    expect(list().map((i) => i.client_key).sort()).toEqual(["ck1", "ck2"]);
  });

  it("filters pending by thread", () => {
    enqueue(mk("a", 1, "x", "t1"));
    enqueue(mk("b", 2, "y", "t2"));
    expect(pendingCount("t1")).toBe(1);
    expect(pendingCount("t2")).toBe(1);
  });

  it("flush sends oldest-first and removes on success", async () => {
    enqueue(mk("late", 200));
    enqueue(mk("early", 100));
    const order: string[] = [];
    const sent = await flush(async (item) => { order.push(item.client_key); });
    expect(order).toEqual(["early", "late"]); // oldest-first
    expect(sent).toBe(2);
    expect(pendingCount()).toBe(0);
  });

  it("flush STOPS on the first failure and keeps the rest queued (offline-safe)", async () => {
    enqueue(mk("ok", 1));
    enqueue(mk("boom", 2));
    enqueue(mk("after", 3));
    const send = vi.fn(async (item: OutboxItem) => { if (item.client_key === "boom") throw new Error("offline"); });
    const sent = await flush(send);
    expect(sent).toBe(1); // only "ok" sent
    expect(pendingCount()).toBe(2); // "boom" + "after" remain
    expect(list().map((i) => i.client_key)).toContain("boom");
    expect(list().map((i) => i.client_key)).toContain("after");
  });

  it("remove drops a single item by client_key", () => {
    enqueue(mk("keep", 1));
    enqueue(mk("drop", 2));
    remove("drop");
    expect(list().map((i) => i.client_key)).toEqual(["keep"]);
  });
});
