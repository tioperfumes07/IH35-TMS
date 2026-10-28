import { describe, expect, it } from "vitest";
import { postValidatedPostingLinesInClientTx } from "./posting-engine.service.js";
import type { PostingLineWrite, PostingWriterClient } from "./posting-line-writer.js";

const lines = (): PostingLineWrite[] => ["debit", "credit"].map((side, index) => ({
  operating_company_id: "company", journal_entry_uuid: "header", line_sequence: index + 1,
  account_id: `account-${index}`, debit_or_credit: side as "debit" | "credit", amount_cents: 12345,
  description: "original memo", source_transaction_type: "journal_entry", source_transaction_id: "header",
  idempotency_key: "batch", entity_uuid: "party", entity_type: "vendor", load_id: "load",
}));

function database(options: { closed?: boolean; header?: boolean; accounts?: boolean; inactive?: boolean; failSpine?: boolean; missingSpine?: boolean; existing?: unknown[]; originals?: Record<string, unknown> } = {}) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const client = { query: async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (sql.includes("SELECT entry_date::text")) return { rows: options.header === false ? [] : [{ entry_date: "2026-10-27" }] };
    if (sql.includes("SELECT * FROM accounting.journal_entry_postings")) return { rows: options.existing ?? [] };
    if (sql.includes("SELECT journal_entry_posting_id::text")) return { rows: options.missingSpine ? [] : [{ id: params?.[1] }] };
    if (sql.includes("closed_period_cutoff")) return { rows: [{ cutoff: options.closed ? "2026-10-31" : null }] };
    if (sql.includes("FROM catalogs.accounts WHERE id = ANY")) return { rows: options.accounts === false ? [] : (params?.[0] as string[]).map(id => ({ id, is_postable: !options.inactive })) };
    if (sql.includes("SELECT account_id::text, debit_or_credit, amount_cents, reversal_of_line_id::text")) return { rows: options.originals?.[String(params?.[0])] ? [options.originals[String(params?.[0])]] : [] };
    if (sql.includes("INSERT INTO accounting.journal_entry_postings")) return { rows: [{ id: `posting-${params?.[2]}` }] };
    if (sql.includes("INSERT INTO accounting.transaction_source_links") && options.failSpine) throw new Error("spine failed");
    return { rows: [] };
  } } as PostingWriterClient;
  return { client, calls, insertCount: () => calls.filter(c => c.sql.includes("INSERT INTO accounting.journal_entry_postings")).length };
}

describe("ENG-28 full batch posting door", () => {
  it("preserves exact amounts, sides, dimensions, and one spine per posting", async () => {
    const db = database();
    expect(await postValidatedPostingLinesInClientTx(db.client, lines())).toEqual(["posting-1", "posting-2"]);
    const inserts = db.calls.filter(c => c.sql.includes("INSERT INTO accounting.journal_entry_postings"));
    expect(inserts.map(c => c.params?.slice(0, 9))).toEqual(lines().map(l => [l.operating_company_id, l.journal_entry_uuid, l.line_sequence, l.account_id, l.debit_or_credit, l.amount_cents, l.description, l.source_transaction_type, l.source_transaction_id]));
    expect(db.calls.filter(c => c.sql.includes("INSERT INTO accounting.transaction_source_links"))).toHaveLength(2);
  });
  it.each(["imbalance", "negative", "fraction", "unsafe", "company", "header", "sequence", "side", "source"])("refuses %s before insertion", async kind => {
    const input = lines();
    if (kind === "imbalance") input[0].amount_cents++;
    if (kind === "negative") input[0].amount_cents = -1;
    if (kind === "fraction") input[0].amount_cents = 0.5;
    if (kind === "unsafe") input[0].amount_cents = Number.MAX_SAFE_INTEGER + 1;
    if (kind === "company") input[0].operating_company_id = "other";
    if (kind === "header") input[0].journal_entry_uuid = "other";
    if (kind === "sequence") input[0].line_sequence = input[1].line_sequence;
    if (kind === "side") input[0].debit_or_credit = "bad" as "debit";
    if (kind === "source") input[0].source_transaction_id = "";
    const db = database();
    await expect(postValidatedPostingLinesInClientTx(db.client, input)).rejects.toThrow();
    expect(db.insertCount()).toBe(0);
  });
  it.each([{ closed: true }, { header: false }, { accounts: false }])("refuses invalid database context %o", async options => {
    const db = database(options);
    await expect(postValidatedPostingLinesInClientTx(db.client, lines())).rejects.toThrow();
    expect(db.insertCount()).toBe(0);
  });
  it("preserves zero settlement legs within a positive balanced batch", async () => {
    const input = lines(); input.push({ ...input[0], line_sequence: 3, amount_cents: 0 });
    const db = database();
    await expect(postValidatedPostingLinesInClientTx(db.client, input)).resolves.toHaveLength(3);
  });
  it("rolls back posting and spine as one batch on downstream failure", async () => {
    const db = database({ failSpine: true });
    await expect(postValidatedPostingLinesInClientTx(db.client, lines())).rejects.toThrow("spine failed");
    expect(db.calls.some(c => c.sql === "ROLLBACK TO SAVEPOINT validated_posting_batch")).toBe(true);
  });
  it("exact complete retry returns nullable slots without another insert", async () => {
    const db = database({ closed: true, existing: lines().map((line, i) => ({ ...line, id: `old-${i}` })) });
    await expect(postValidatedPostingLinesInClientTx(db.client, lines(), { skipOnIdempotencyConflict: true })).resolves.toEqual([null, null]);
    expect(db.insertCount()).toBe(0);
    expect(db.calls.filter(c => c.sql.includes("SELECT journal_entry_posting_id::text")).map(c => c.params)).toEqual([
      ["company", "old-0", "journal_entry", "header", "source_transaction"],
      ["company", "old-1", "journal_entry", "header", "source_transaction"],
    ]);
  });
  it("refuses retry with missing or changed lineage", async () => {
    const db = database({ existing: lines().map((line, i) => ({ ...line, id: `old-${i}` })), missingSpine: true });
    await expect(postValidatedPostingLinesInClientTx(db.client, lines(), { skipOnIdempotencyConflict: true })).rejects.toThrow("spine_conflict");
  });
  it("accepts mixed source IDs and idempotency keys without rewriting them", async () => {
    const input = lines(); input[1].source_transaction_id = "another-document"; input[1].idempotency_key = "another-key";
    await expect(postValidatedPostingLinesInClientTx(database().client, input)).resolves.toHaveLength(2);
  });
  it("refuses replay without explicit idempotency keys", async () => {
    const input = lines().map(line => ({ ...line, idempotency_key: null }));
    await expect(postValidatedPostingLinesInClientTx(database({ existing: input }).client, input, { skipOnIdempotencyConflict: true })).rejects.toThrow("replay_conflict");
  });
  it("permits inactive-account reversal only with exact original provenance", async () => {
    const input = lines().map((line, i) => ({ ...line, reversal_of_line_id: `original-${i}` }));
    const originals = Object.fromEntries(input.map(line => [line.reversal_of_line_id, { account_id: line.account_id, amount_cents: line.amount_cents, debit_or_credit: line.debit_or_credit === "debit" ? "credit" : "debit" }]));
    const db = database({ inactive: true, originals });
    // Simulate the original's successful back-link claim.
    const query = db.client.query.bind(db.client);
    db.client.query = (async (sql: string, params?: unknown[]) => sql.includes("SET reversed_by_line_id") ? { rows: [{ id: params?.[0] }] } : query(sql, params)) as PostingWriterClient["query"];
    await expect(postValidatedPostingLinesInClientTx(db.client, input)).resolves.toHaveLength(2);
    const invalid = lines(); invalid[0].reversal_of_line_id = "original-0"; invalid[1].account_id = "account-0";
    await expect(postValidatedPostingLinesInClientTx(database({ inactive: true, originals }).client, invalid)).rejects.toThrow("account_missing");
    await expect(postValidatedPostingLinesInClientTx(database({ originals: {} }).client, input)).rejects.toThrow("provenance_invalid");
  });
  it.each([lines().slice(0, 1), lines().map(l => ({ ...l, journal_entry_uuid: "other" })), lines().map(l => ({ ...l, amount_cents: 4 }))].map(existing => ({ existing })))("rejects partial or altered replay", async ({ existing }) => {
    const db = database({ existing });
    await expect(postValidatedPostingLinesInClientTx(db.client, lines(), { skipOnIdempotencyConflict: true })).rejects.toThrow("replay_conflict");
    expect(db.insertCount()).toBe(0);
  });
});
