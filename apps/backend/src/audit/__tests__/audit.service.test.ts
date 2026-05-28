import { describe, expect, it } from "vitest";
import { buildAuditRowChangesQuery } from "../audit.service.js";

describe("buildAuditRowChangesQuery", () => {
  it("builds query with all optional filters", () => {
    const query = buildAuditRowChangesQuery({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      schema: "accounting",
      table: "bills",
      row_pk: "abc-123",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-31T23:59:59.000Z",
      limit: 120,
      offset: 40,
    });

    expect(query.sql).toContain("FROM audit.row_changes");
    expect(query.sql).toContain("tenant_id = $1::uuid");
    expect(query.sql).toContain("schema_name = $2");
    expect(query.sql).toContain("table_name = $3");
    expect(query.sql).toContain("row_pk = $4");
    expect(query.sql).toContain("changed_at >= $5::timestamptz");
    expect(query.sql).toContain("changed_at <= $6::timestamptz");
    expect(query.sql).toContain("LIMIT $7");
    expect(query.sql).toContain("OFFSET $8");
    expect(query.values).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "accounting",
      "bills",
      "abc-123",
      "2026-01-01T00:00:00.000Z",
      "2026-01-31T23:59:59.000Z",
      120,
      40,
    ]);
  });

  it("normalizes out-of-range paging values", () => {
    const query = buildAuditRowChangesQuery({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      limit: 9_999,
      offset: -5,
    });

    expect(query.values.at(-2)).toBe(500);
    expect(query.values.at(-1)).toBe(0);
  });
});
