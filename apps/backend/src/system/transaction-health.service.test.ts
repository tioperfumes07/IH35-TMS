import { describe, expect, it } from "vitest";
import { decodeTxHealthCursor, fetchTransactionHealth, type TxHealthClient } from "./transaction-health.service.js";

const COMPANY_A = "5c854333-6ea5-4faa-af31-67cb272fef80";

type RawRow = {
  doc_type: string;
  id: string;
  operating_company_id: string;
  entity_code: string;
  display_label: string;
  event_at: string;
  is_sample_data: boolean | null;
  posted: boolean;
  balanced: boolean;
  linked: boolean;
  sample_consistent: boolean | null;
};

function row(overrides: Partial<RawRow> & Pick<RawRow, "doc_type" | "id" | "event_at">): RawRow {
  return {
    operating_company_id: COMPANY_A,
    entity_code: "USMCA",
    display_label: overrides.id,
    is_sample_data: false,
    posted: true,
    balanced: true,
    linked: true,
    sample_consistent: true,
    ...overrides,
  };
}

// Mock client: the main UNION query is identified by its "WITH u AS" anchor, the per-page findings
// enrichment query by its "_system.reconciliation_findings" anchor — the same shape as this file's
// real two-phase read (see fetchTransactionHealth's own comment).
function makeClient(opts: {
  pageRows: RawRow[];
  findings?: Array<{ id: string; finding_type: string; severity: string; resource_scope: unknown; local_value: unknown }>;
}): TxHealthClient & { calls: Array<{ sql: string; values?: unknown[] }> } {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  return {
    calls,
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      if (sql.includes("WITH u AS")) {
        return { rows: opts.pageRows };
      }
      if (sql.includes("_system.reconciliation_findings")) {
        return { rows: opts.findings ?? [] };
      }
      return { rows: [] };
    },
  };
}

describe("transaction-health.service — decodeTxHealthCursor", () => {
  it("round-trips a valid cursor", () => {
    const encoded = Buffer.from(JSON.stringify({ event_at: "2026-08-01T00:00:00.000Z", id: "abc" }), "utf8").toString("base64url");
    expect(decodeTxHealthCursor(encoded)).toEqual({ event_at: "2026-08-01T00:00:00.000Z", id: "abc" });
  });

  it("returns null for undefined, malformed, or incomplete cursors", () => {
    expect(decodeTxHealthCursor(undefined)).toBeNull();
    expect(decodeTxHealthCursor("not-base64url-json")).toBeNull();
    const missingId = Buffer.from(JSON.stringify({ event_at: "2026-08-01T00:00:00.000Z" }), "utf8").toString("base64url");
    expect(decodeTxHealthCursor(missingId)).toBeNull();
  });
});

describe("transaction-health.service — fetchTransactionHealth status derivation", () => {
  it("marks a document FAIL when any of posted/balanced/linked is false — the two spec acceptance cases", async () => {
    // Live-verified 2026-08-28 (br-fancy-credit-akjnd07a): factoring.batch 583d6d03... has factor_id
    // NULL, and invoice 6708d422... sits in that batch's invoice_ids with factoring_status still
    // 'not_factored' — the exact two rows this test reproduces the SHAPE of (not the live ids).
    const client = makeClient({
      pageRows: [
        row({ doc_type: "factoring_batch", id: "batch-1", event_at: "2026-08-28T05:38:00Z", sample_consistent: null, linked: false }),
        row({ doc_type: "invoice", id: "inv-1", event_at: "2026-08-27T00:00:00Z", linked: false }),
      ],
    });

    const result = await fetchTransactionHealth(client, {
      operatingCompanyIds: [COMPANY_A],
      cursor: null,
      limit: 50,
      issuesOnly: false,
    });

    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((r) => r.status === "FAIL")).toBe(true);
    expect(result.rows.find((r) => r.doc_type === "factoring_batch")?.checks.sample_consistent).toBeNull();
  });

  it("marks a document WARN (not FAIL) when only sample_consistent is false", async () => {
    const client = makeClient({
      pageRows: [row({ doc_type: "invoice", id: "inv-2", event_at: "2026-08-27T00:00:00Z", sample_consistent: false })],
    });

    const result = await fetchTransactionHealth(client, {
      operatingCompanyIds: [COMPANY_A],
      cursor: null,
      limit: 50,
      issuesOnly: false,
    });

    expect(result.rows[0].status).toBe("WARN");
  });

  it("never upgrades an UNVERIFIABLE (null) sample_consistent to WARN by itself", async () => {
    const client = makeClient({
      pageRows: [row({ doc_type: "factoring_batch", id: "batch-2", event_at: "2026-08-27T00:00:00Z", sample_consistent: null })],
    });

    const result = await fetchTransactionHealth(client, {
      operatingCompanyIds: [COMPANY_A],
      cursor: null,
      limit: 50,
      issuesOnly: false,
    });

    expect(result.rows[0].status).toBe("OK");
    expect(result.rows[0].checks.sample_consistent).toBeNull();
  });

  it("marks a clean document OK when every check passes and no finding names it", async () => {
    const client = makeClient({
      pageRows: [row({ doc_type: "bill", id: "bill-1", event_at: "2026-08-27T00:00:00Z" })],
    });

    const result = await fetchTransactionHealth(client, {
      operatingCompanyIds: [COMPANY_A],
      cursor: null,
      limit: 50,
      issuesOnly: false,
    });

    expect(result.rows[0].status).toBe("OK");
  });

  it("upgrades an otherwise-clean document to WARN when an open finding's payload names its id", async () => {
    const client = makeClient({
      pageRows: [row({ doc_type: "bill", id: "bill-2", event_at: "2026-08-27T00:00:00Z" })],
      findings: [
        {
          id: "finding-1",
          finding_type: "subledger_tie_out_diff",
          severity: "critical",
          resource_scope: { account_id: "bill-2" },
          local_value: {},
        },
      ],
    });

    const result = await fetchTransactionHealth(client, {
      operatingCompanyIds: [COMPANY_A],
      cursor: null,
      limit: 50,
      issuesOnly: false,
    });

    expect(result.rows[0].status).toBe("WARN");
    expect(result.rows[0].findings).toHaveLength(1);
  });

  it("does not attach a finding whose payload never mentions the document's id", async () => {
    const client = makeClient({
      pageRows: [row({ doc_type: "bill", id: "bill-3", event_at: "2026-08-27T00:00:00Z" })],
      findings: [
        {
          id: "finding-2",
          finding_type: "subledger_tie_out_diff",
          severity: "critical",
          resource_scope: { account_id: "some-other-account" },
          local_value: {},
        },
      ],
    });

    const result = await fetchTransactionHealth(client, {
      operatingCompanyIds: [COMPANY_A],
      cursor: null,
      limit: 50,
      issuesOnly: false,
    });

    expect(result.rows[0].status).toBe("OK");
    expect(result.rows[0].findings).toHaveLength(0);
  });

  it("filters to non-OK rows only when issuesOnly is true, without dropping them from the cursor page", async () => {
    const client = makeClient({
      pageRows: [
        row({ doc_type: "bill", id: "clean-1", event_at: "2026-08-27T03:00:00Z" }),
        row({ doc_type: "invoice", id: "broken-1", event_at: "2026-08-27T02:00:00Z", posted: false }),
        row({ doc_type: "bill", id: "clean-2", event_at: "2026-08-27T01:00:00Z" }),
      ],
    });

    const result = await fetchTransactionHealth(client, {
      operatingCompanyIds: [COMPANY_A],
      cursor: null,
      limit: 50,
      issuesOnly: true,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe("broken-1");
  });
});

describe("transaction-health.service — pagination", () => {
  it("returns a next_cursor keyed off the last row when more rows exist than the page limit", async () => {
    const client = makeClient({
      pageRows: [
        row({ doc_type: "bill", id: "a", event_at: "2026-08-27T03:00:00Z" }),
        row({ doc_type: "bill", id: "b", event_at: "2026-08-27T02:00:00Z" }),
        row({ doc_type: "bill", id: "c", event_at: "2026-08-27T01:00:00Z" }), // the +1 overfetch row
      ],
    });

    const result = await fetchTransactionHealth(client, {
      operatingCompanyIds: [COMPANY_A],
      cursor: null,
      limit: 2,
      issuesOnly: false,
    });

    expect(result.rows).toHaveLength(2);
    expect(result.next_cursor).not.toBeNull();
    const decoded = decodeTxHealthCursor(result.next_cursor ?? undefined);
    expect(decoded).toEqual({ event_at: "2026-08-27T02:00:00Z", id: "b" });
  });

  it("returns a null next_cursor when the page is not full", async () => {
    const client = makeClient({
      pageRows: [row({ doc_type: "bill", id: "only-one", event_at: "2026-08-27T00:00:00Z" })],
    });

    const result = await fetchTransactionHealth(client, {
      operatingCompanyIds: [COMPANY_A],
      cursor: null,
      limit: 50,
      issuesOnly: false,
    });

    expect(result.next_cursor).toBeNull();
  });

  it("binds the cursor values into the query when one is supplied", async () => {
    const client = makeClient({ pageRows: [] });

    await fetchTransactionHealth(client, {
      operatingCompanyIds: [COMPANY_A],
      cursor: { event_at: "2026-08-01T00:00:00.000Z", id: "cursor-id" },
      limit: 50,
      issuesOnly: false,
    });

    const mainCall = client.calls.find((c) => c.sql.includes("WITH u AS"));
    expect(mainCall?.values).toContain("2026-08-01T00:00:00.000Z");
    expect(mainCall?.values).toContain("cursor-id");
  });
});
