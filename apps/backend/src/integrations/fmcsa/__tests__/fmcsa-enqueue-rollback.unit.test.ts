import { describe, expect, it, vi } from "vitest";

const appendCrudAudit = vi.fn(async () => undefined);

vi.mock("../../../audit/crud-audit.js", () => ({
  appendCrudAudit: (...args: unknown[]) => appendCrudAudit(...args),
}));

describe("enqueueFmcsaCustomerVerifyRequested same-txn rollback semantics", () => {
  it("does not leave a committed insert when the outer txn rolls back (client-visible)", async () => {
    const { enqueueFmcsaCustomerVerifyRequested } = await import("../fmcsa-customer-verify-chain.service.js");
    const rows: Array<{ id: string; committed: boolean }> = [];
    let inTxn = false;

    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql === "BEGIN") {
          inTxn = true;
          return { rows: [] };
        }
        if (sql === "COMMIT") {
          for (const row of rows) row.committed = true;
          inTxn = false;
          return { rows: [] };
        }
        if (sql === "ROLLBACK") {
          for (let i = rows.length - 1; i >= 0; i--) {
            if (!rows[i]!.committed) rows.splice(i, 1);
          }
          inTxn = false;
          return { rows: [] };
        }
        if (sql.includes("INSERT INTO outbox.events")) {
          const id = `evt-${rows.length + 1}`;
          rows.push({ id, committed: !inTxn });
          return { rows: [{ id }] };
        }
        return { rows: [] };
      }),
    };

    await client.query("BEGIN");
    const enq = await enqueueFmcsaCustomerVerifyRequested(client as never, {
      operating_company_id: "00000000-0000-4000-8000-0000000000a1",
      customer_id: "00000000-0000-4000-8000-0000000000c1",
      actor_user_id: "00000000-0000-4000-8000-0000000000d1",
      trigger: "create",
      lookup_fingerprint: "mc=1|dot=",
    });
    expect(enq.enqueued).toBe(true);
    expect(rows).toHaveLength(1);
    await client.query("ROLLBACK");
    expect(rows).toHaveLength(0);
  });
});
