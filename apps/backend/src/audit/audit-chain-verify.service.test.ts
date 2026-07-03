import { describe, expect, it, vi } from "vitest";
import { verifyEventChain, VERIFIER_VERSION } from "./audit-chain-verify.service.js";

const OPCO = "11111111-1111-4111-8111-111111111111";

function makeClient(counts: { events_checked: string; hash_breaks: string; link_breaks: string; first_break_seq: string | null }) {
  const inserts: unknown[][] = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes("INSERT INTO")) {
      inserts.push(values ?? []);
      return { rows: [] };
    }
    return { rows: [counts] };
  });
  return { client: { query } as never, inserts, query };
}

describe("verifyEventChain (B19-V2)", () => {
  it("clean chain → chain_ok=true and records the run", async () => {
    const { client, inserts } = makeClient({ events_checked: "5", hash_breaks: "0", link_breaks: "0", first_break_seq: null });
    const r = await verifyEventChain(client, OPCO);
    expect(r.chain_ok).toBe(true);
    expect(r.events_checked).toBe(5);
    // recorded: [opco, events, hash, link, chain_ok, first_break, version]
    expect(inserts[0]?.[4]).toBe(true);
    expect(inserts[0]?.[6]).toBe(VERIFIER_VERSION);
  });

  it("a hash break → chain_ok=false with first_break_seq", async () => {
    const { client, inserts } = makeClient({ events_checked: "5", hash_breaks: "1", link_breaks: "0", first_break_seq: "3" });
    const r = await verifyEventChain(client, OPCO);
    expect(r.chain_ok).toBe(false);
    expect(r.hash_breaks).toBe(1);
    expect(r.first_break_seq).toBe("3");
    expect(inserts[0]?.[4]).toBe(false);
  });

  it("a link break also fails the chain", async () => {
    const { client } = makeClient({ events_checked: "5", hash_breaks: "0", link_breaks: "2", first_break_seq: "4" });
    const r = await verifyEventChain(client, OPCO);
    expect(r.chain_ok).toBe(false);
    expect(r.link_breaks).toBe(2);
  });
});
