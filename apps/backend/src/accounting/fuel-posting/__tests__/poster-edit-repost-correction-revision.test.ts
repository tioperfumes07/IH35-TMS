// LEAD 443.215 (5842 repost) — an Edit = void and repost reverses the fill's posting in the void; the repost must post it
// under the next correction revision. On main there is no revision helper and the poster refuses the reversed key
// ("fuel_posting_refused_reversed_no_live_posting"), so no settlement with a Relay fill could be reposted.
import { describe, expect, it, vi } from "vitest";
import * as poster from "../poster.service.js";

const OC = "11111111-1111-4111-8111-111111111111";
const FILL = "d007a2f8-a14e-4bb8-a7db-db40a0f37acd";

/** keys: idempotency key suffix -> "reversed" | "standing"; any other key is unused. */
function client(keys: Record<string, "reversed" | "standing">) {
  const batchFor = (key: string) => {
    const suffix = /:r(\d+)$/.exec(key)?.[1] ?? "0";
    return keys[suffix] ? { id: `batch-${suffix}`, state: keys[suffix] } : null;
  };
  return {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM accounting.posting_batches")) {
        const b = batchFor(String(values?.[1] ?? ""));
        return { rows: b ? [{ id: b.id, batch_status: "posted" }] : [] };
      }
      if (sql.includes("FROM accounting.journal_entry_postings")) {
        const batch = String(values?.[1] ?? "");
        const standingOnly = sql.includes("reversed_by_je_id IS NULL");
        const state = Object.entries(keys).find(([s]) => `batch-${s}` === batch)?.[1];
        if (standingOnly && state !== "standing") return { rows: [] };
        return { rows: [{ posting_id: `${batch}-p`, journal_entry_uuid: `${batch}-je` }] };
      }
      return { rows: [] };
    }),
  };
}

describe("443.215 — the repost of a reversed fill posts under the next correction revision", () => {
  it("original key reversed, unused r1 -> revision 1", async () => {
    const next = (poster as Record<string, unknown>).nextFuelPostingRevision as ((c: unknown, i: unknown) => Promise<number>) | undefined;
    expect(typeof next).toBe("function");
    expect(await next!(client({ "0": "reversed" }), { operating_company_id: OC, fuel_event_id: FILL, posting_path: "company_direct" })).toBe(1);
  });
  it("original stands -> revision 0 (no correction, the standing posting is reused)", async () => {
    const next = (poster as Record<string, unknown>).nextFuelPostingRevision as (c: unknown, i: unknown) => Promise<number>;
    expect(await next(client({ "0": "standing" }), { operating_company_id: OC, fuel_event_id: FILL, posting_path: "company_direct" })).toBe(0);
  });
  it("original and r1 reversed -> revision 2", async () => {
    const next = (poster as Record<string, unknown>).nextFuelPostingRevision as (c: unknown, i: unknown) => Promise<number>;
    expect(await next(client({ "0": "reversed", "1": "reversed" }), { operating_company_id: OC, fuel_event_id: FILL, posting_path: "company_direct" })).toBe(2);
  });
});
