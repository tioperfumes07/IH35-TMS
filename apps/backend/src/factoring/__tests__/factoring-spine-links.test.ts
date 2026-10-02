import { describe, expect, it, vi } from "vitest";

const { mockLink } = vi.hoisted(() => ({ mockLink: vi.fn() }));
vi.mock("../../accounting/accounting-spine-emit.js", () => ({ writeTransactionSourceLink: mockLink }));

import { writeFactoringSpineLinks } from "../factoring-spine-links.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";

describe("owner ruling 2026-10-02 — factoring legs link to their invoice on the spine", () => {
  it("faro entry legs link the entry + its invoice; invoice legs link the invoice; unresolved legs link only the entry", async () => {
    mockLink.mockReset();
    const client = {
      query: vi.fn(async () => ({
        rows: [
          { id: "p1", source_transaction_type: "faro_reserve_entry", source_transaction_id: "e1", invoice_id: "inv-1" },
          { id: "p2", source_transaction_type: "faro_reserve_entry", source_transaction_id: "e2", invoice_id: null },
          { id: "p3", source_transaction_type: "invoice", source_transaction_id: "inv-3", invoice_id: "inv-3" },
        ],
      })),
    };
    const n = await writeFactoringSpineLinks(client, OPCO, "je-1", "faro_schedule_fee");
    expect(n).toBe(4);
    expect(mockLink.mock.calls.map((c) => [c[1].journal_entry_posting_id, c[1].linked_object_type, c[1].linked_object_id])).toEqual([
      ["p1", "faro_reserve_entry", "e1"],
      ["p1", "invoice", "inv-1"],
      ["p2", "faro_reserve_entry", "e2"],
      ["p3", "invoice", "inv-3"],
    ]);
    expect(mockLink.mock.calls[1]![1].relationship_role).toBe("faro_schedule_fee");
  });
});
