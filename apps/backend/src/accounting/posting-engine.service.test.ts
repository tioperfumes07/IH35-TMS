import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryCall = { sql: string; values?: unknown[] };

const withCurrentUserMock = vi.fn();

vi.mock("../auth/db.js", () => ({
  withCurrentUser: (...args: unknown[]) => withCurrentUserMock(...args),
}));

function createMockClient(handler: (sql: string, values?: unknown[]) => { rows: unknown[]; rowCount?: number }) {
  const calls: QueryCall[] = [];
  return {
    calls,
    client: {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        return handler(sql, values);
      }),
    },
  };
}

describe("posting engine service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects ineligible invoice status (draft) with zero posting inserts", async () => {
    const { client, calls } = createMockClient((sql) => {
      if (sql.includes("FROM accounting.posting_batches")) return { rows: [] };
      if (sql.includes("FROM accounting.invoices")) {
        return {
          rows: [
            {
              id: "9f943015-e3d2-4f1f-8732-c0ef4bbd25fc",
              status: "draft",
              issue_date: "2026-05-01",
              total_cents: 1000,
              display_id: "INV-2026-00001",
              source_load_id: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    withCurrentUserMock.mockImplementation(async (_userId: string, fn: (c: typeof client) => Promise<unknown>) => fn(client));

    const mod = await import("./posting-engine.service.js");

    await expect(
      mod.postSourceTransaction(
        {
          operating_company_id: "2cf17ad1-c728-4f54-a930-d6beed95eb37",
          source_transaction_type: "invoice",
          source_transaction_id: "9f943015-e3d2-4f1f-8732-c0ef4bbd25fc",
          posting_purpose: "initial_post",
        },
        { userId: "cd9d01fe-a90d-4cd2-a96d-f6a443f7debc" }
      )
    ).rejects.toMatchObject({
      code: "INVOICE_NOT_POSTING_ELIGIBLE",
    });

    expect(calls.some((c) => c.sql.includes("INSERT INTO accounting.journal_entry_postings"))).toBe(false);
  });

  it("returns already_posted from idempotency pre-check before any insert", async () => {
    const { client, calls } = createMockClient((sql) => {
      if (sql.includes("FROM accounting.posting_batches")) {
        return {
          rows: [{ id: "3d4a26c2-a6e6-43bf-93f2-0863f37f36a3", batch_status: "posted" }],
        };
      }
      if (sql.includes("FROM accounting.journal_entry_postings")) {
        return {
          rows: [
            {
              posting_id: "d6d307af-8170-4c68-9d34-9f9119a97fca",
              journal_entry_uuid: "d6f106fb-27ff-4b90-bf21-a05791a479f9",
            },
          ],
        };
      }
      return { rows: [] };
    });

    withCurrentUserMock.mockImplementation(async (_userId: string, fn: (c: typeof client) => Promise<unknown>) => fn(client));

    const mod = await import("./posting-engine.service.js");
    const result = await mod.postSourceTransaction(
      {
        operating_company_id: "2cf17ad1-c728-4f54-a930-d6beed95eb37",
        source_transaction_type: "invoice",
        source_transaction_id: "9f943015-e3d2-4f1f-8732-c0ef4bbd25fc",
        posting_purpose: "initial_post",
      },
      { userId: "cd9d01fe-a90d-4cd2-a96d-f6a443f7debc" }
    );

    expect(result.result).toBe("already_posted");
    expect(calls.some((c) => c.sql.includes("INSERT INTO accounting.posting_batches"))).toBe(false);
    expect(calls.some((c) => c.sql.includes("INSERT INTO accounting.journal_entry_postings"))).toBe(false);
  });
});
