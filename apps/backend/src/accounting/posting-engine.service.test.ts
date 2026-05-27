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

  it("splits invoice tax to sales_tax_payable role instead of revenue", async () => {
    const postingInsertValues: unknown[][] = [];
    const { client } = createMockClient((sql, values) => {
      if (sql.includes("FROM accounting.posting_batches")) return { rows: [] };
      if (sql.includes("FROM accounting.invoices")) {
        return {
          rows: [
            {
              id: "9f943015-e3d2-4f1f-8732-c0ef4bbd25fc",
              status: "sent",
              issue_date: "2026-05-01",
              total_cents: 10000,
              tax_cents: 1200,
              display_id: "INV-2026-00001",
              source_load_id: null,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.invoice_lines il")) return { rows: [] };
      if (sql.includes("FROM accounting.chart_of_accounts_roles car") && Array.isArray(values) && values[1] === "ar_control") {
        return { rows: [{ account_id: "11111111-1111-4111-8111-111111111111" }] };
      }
      if (sql.includes("FROM accounting.chart_of_accounts_roles car") && Array.isArray(values) && values[1] === "revenue_default") {
        return { rows: [{ account_id: "22222222-2222-4222-8222-222222222222" }] };
      }
      if (sql.includes("FROM accounting.chart_of_accounts_roles car") && Array.isArray(values) && values[1] === "sales_tax_payable") {
        return { rows: [{ account_id: "33333333-3333-4333-8333-333333333333" }] };
      }
      if (sql.includes("FROM catalogs.account_role_bindings")) return { rows: [] };
      if (sql.includes("FROM catalogs.accounts") && sql.includes("account_type")) return { rows: [] };
      if (sql.includes("SELECT accounting.closed_period_cutoff")) return { rows: [{ cutoff: null }] };
      if (sql.includes("INSERT INTO accounting.posting_batches")) return { rows: [{ id: "44444444-4444-4444-8444-444444444444" }] };
      if (sql.includes("UPDATE accounting.posting_batches")) return { rows: [] };
      if (sql.includes("INSERT INTO accounting.journal_entries")) return { rows: [{ id: "55555555-5555-4555-8555-555555555555" }] };
      if (sql.includes("INSERT INTO accounting.journal_entry_postings")) {
        if (values) postingInsertValues.push(values);
        return { rows: [{ id: "66666666-6666-4666-8666-666666666666" }] };
      }
      if (sql.includes("INSERT INTO accounting.transaction_source_links")) return { rows: [] };
      return { rows: [] };
    });

    withCurrentUserMock.mockImplementation(async (_userId: string, fn: (c: typeof client) => Promise<unknown>) => fn(client));

    const mod = await import("./posting-engine.service.js");
    await mod.postSourceTransaction(
      {
        operating_company_id: "2cf17ad1-c728-4f54-a930-d6beed95eb37",
        source_transaction_type: "invoice",
        source_transaction_id: "9f943015-e3d2-4f1f-8732-c0ef4bbd25fc",
        posting_purpose: "initial_post",
      },
      { userId: "cd9d01fe-a90d-4cd2-a96d-f6a443f7debc" }
    );

    const creditLines = postingInsertValues.filter((values) => values[4] === "credit");
    expect(creditLines).toHaveLength(2);
    expect(creditLines.some((values) => values[3] === "22222222-2222-4222-8222-222222222222" && values[5] === 8800)).toBe(true);
    expect(creditLines.some((values) => values[3] === "33333333-3333-4333-8333-333333333333" && values[5] === 1200)).toBe(true);
  });

  it("prevents duplicate JE during concurrent retry race", async () => {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let postingBatchInsertCount = 0;
    let journalEntryInsertCount = 0;
    let postingLineInsertCount = 0;
    const { client } = createMockClient(async (sql, values) => {
      if (sql.includes("FROM accounting.posting_batches")) return { rows: [] };
      if (sql.includes("FROM accounting.invoices")) {
        return {
          rows: [
            {
              id: "9f943015-e3d2-4f1f-8732-c0ef4bbd25fc",
              status: "sent",
              issue_date: "2026-05-01",
              total_cents: 10000,
              tax_cents: 0,
              display_id: "INV-2026-00001",
              source_load_id: null,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.invoice_lines il")) return { rows: [] };
      if (sql.includes("SELECT id::text AS id") && sql.includes("FROM accounting.journal_entries")) {
        return { rows: [{ id: "55555555-5555-4555-8555-555555555555" }] };
      }
      if (sql.includes("FROM accounting.journal_entry_postings jep")) {
        if (postingLineInsertCount > 0) {
          return {
            rows: [
              {
                posting_id: "66666666-6666-4666-8666-666666666666",
                journal_entry_uuid: "55555555-5555-4555-8555-555555555555",
                posting_batch_id: "44444444-4444-4444-8444-444444444444",
              },
            ],
          };
        }
        return { rows: [] };
      }
      if (sql.includes("FROM accounting.chart_of_accounts_roles car") && Array.isArray(values) && values[1] === "ar_control") {
        return { rows: [{ account_id: "11111111-1111-4111-8111-111111111111" }] };
      }
      if (sql.includes("FROM accounting.chart_of_accounts_roles car") && Array.isArray(values) && values[1] === "revenue_default") {
        return { rows: [{ account_id: "22222222-2222-4222-8222-222222222222" }] };
      }
      if (sql.includes("FROM accounting.chart_of_accounts_roles car") && Array.isArray(values) && values[1] === "sales_tax_payable") {
        return { rows: [] };
      }
      if (sql.includes("FROM catalogs.account_role_bindings")) return { rows: [] };
      if (sql.includes("FROM catalogs.accounts") && sql.includes("account_type")) return { rows: [] };
      if (sql.includes("SELECT accounting.closed_period_cutoff")) return { rows: [{ cutoff: null }] };
      if (sql.includes("INSERT INTO accounting.posting_batches")) {
        postingBatchInsertCount += 1;
        if (postingBatchInsertCount === 1) return { rows: [{ id: "44444444-4444-4444-8444-444444444444" }] };
        return { rows: [] };
      }
      if (sql.includes("UPDATE accounting.posting_batches")) return { rows: [] };
      if (sql.includes("INSERT INTO accounting.journal_entries")) {
        journalEntryInsertCount += 1;
        return { rows: [{ id: "55555555-5555-4555-8555-555555555555" }] };
      }
      if (sql.includes("INSERT INTO accounting.journal_entry_postings")) {
        await sleep(40);
        postingLineInsertCount += 1;
        return { rows: [{ id: "66666666-6666-4666-8666-666666666666" }] };
      }
      if (sql.includes("INSERT INTO accounting.transaction_source_links")) return { rows: [] };
      return { rows: [] };
    });

    withCurrentUserMock.mockImplementation(async (_userId: string, fn: (c: typeof client) => Promise<unknown>) => fn(client));

    const mod = await import("./posting-engine.service.js");
    const payload = {
      operating_company_id: "2cf17ad1-c728-4f54-a930-d6beed95eb37",
      source_transaction_type: "invoice",
      source_transaction_id: "9f943015-e3d2-4f1f-8732-c0ef4bbd25fc",
      posting_purpose: "initial_post" as const,
    };

    const [first, second] = await Promise.all([
      mod.postSourceTransaction(payload, { userId: "cd9d01fe-a90d-4cd2-a96d-f6a443f7debc" }),
      mod.postSourceTransaction(payload, { userId: "cd9d01fe-a90d-4cd2-a96d-f6a443f7debc" }),
    ]);

    const resultKinds = new Set([first.result, second.result]);
    expect(resultKinds.has("posted")).toBe(true);
    expect(resultKinds.has("already_posted")).toBe(true);
    expect(journalEntryInsertCount).toBe(1);
  });
});
