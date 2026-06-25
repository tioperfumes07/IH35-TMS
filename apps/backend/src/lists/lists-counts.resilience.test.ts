import { describe, expect, it } from "vitest";
import { countModuleRecords } from "./lists-counts.routes.js";

/**
 * #P3 — the module count query references each spec table directly, so a missing catalog table
 * (prod migration drift) used to 42P01 the WHOLE domain → endpoint 500 → badge 0. countModuleRecords
 * now filters spec tables through to_regclass and counts only the ones that exist. These tests prove a
 * missing table degrades to "sum of existing" (or 0), never a throw, and the count SQL omits it.
 */
type Call = { sql: string; values?: unknown[] };

function mockClient(presentTables: Set<string>, countValue: number) {
  const calls: Call[] = [];
  const client = {
    calls,
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.includes("to_regclass")) {
        const requested = (values?.[0] as string[]) ?? [];
        return { rows: requested.filter((t) => presentTables.has(t)).map((tbl) => ({ tbl })) };
      }
      return { rows: [{ count: countValue }] };
    },
  };
  return client;
}

type CountClient = Parameters<typeof countModuleRecords>[0];

describe("countModuleRecords — missing-table resilience (#P3)", () => {
  it("skips a missing catalog table instead of 42P01-ing the whole domain", async () => {
    // safety spec = internal_fine_reasons, civil_fine_types (MISSING on prod), company_violation_types
    const present = new Set(["catalogs.internal_fine_reasons", "catalogs.company_violation_types"]);
    const client = mockClient(present, 11);
    const count = await countModuleRecords(client as unknown as CountClient, "safety", "00000000-0000-0000-0000-000000000000");
    expect(count).toBe(11);
    const countCall = client.calls.find((c) => !c.sql.includes("to_regclass"))!;
    expect(countCall.sql).not.toContain("civil_fine_types"); // missing table omitted from the sum
    expect(countCall.sql).toContain("internal_fine_reasons");
  });

  it("returns 0 (never throws) when every table in a domain is missing", async () => {
    const client = mockClient(new Set(), 0);
    const count = await countModuleRecords(client as unknown as CountClient, "fuel", "00000000-0000-0000-0000-000000000000");
    expect(count).toBe(0);
    const countCall = client.calls.find((c) => !c.sql.includes("to_regclass"))!;
    expect(countCall.sql).toContain("SELECT 0::int AS count");
  });

  it("still adds the accounting journal-entry constant when tables are missing", async () => {
    const client = mockClient(new Set(), 0);
    const count = await countModuleRecords(client as unknown as CountClient, "accounting", "00000000-0000-0000-0000-000000000000");
    expect(count).toBe(3); // 0 live rows + ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT
  });
});
