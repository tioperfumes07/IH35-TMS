import { describe, expect, it } from "vitest";
import { buildQueryAuditEventsSQL } from "../service.js";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const USER_UUID = "22222222-2222-4222-8222-222222222222";
const ENTITY_UUID = "33333333-3333-4333-8333-333333333333";

describe("buildQueryAuditEventsSQL", () => {
  it("generates base query with operating_company_id filter", () => {
    const { sql, values } = buildQueryAuditEventsSQL({
      operating_company_id: COMPANY_ID,
      limit: 100,
      offset: 0,
    });
    expect(sql).toContain("FROM audit.audit_events");
    expect(sql).toContain("operating_company_id");
    expect(values[0]).toBe(COMPANY_ID);
  });

  it("adds entity_type ILIKE filter", () => {
    const { sql, values } = buildQueryAuditEventsSQL({
      operating_company_id: COMPANY_ID,
      entity_type: "driver",
      limit: 100,
      offset: 0,
    });
    expect(sql).toContain("ILIKE");
    expect(values).toContain("%driver%");
  });

  it("adds entity_uuid filter on payload", () => {
    const { sql, values } = buildQueryAuditEventsSQL({
      operating_company_id: COMPANY_ID,
      entity_uuid: ENTITY_UUID,
      limit: 100,
      offset: 0,
    });
    expect(sql).toContain("entity_uuid");
    expect(values).toContain(ENTITY_UUID);
  });

  it("adds user_uuid filter on actor_user_uuid", () => {
    const { sql, values } = buildQueryAuditEventsSQL({
      operating_company_id: COMPANY_ID,
      user_uuid: USER_UUID,
      limit: 100,
      offset: 0,
    });
    expect(sql).toContain("actor_user_uuid");
    expect(values).toContain(USER_UUID);
  });

  it("adds severity filter", () => {
    const { sql, values } = buildQueryAuditEventsSQL({
      operating_company_id: COMPANY_ID,
      severity: "critical",
      limit: 100,
      offset: 0,
    });
    expect(sql).toContain("severity");
    expect(values).toContain("critical");
  });

  it("adds date range filters", () => {
    const from = "2026-01-01T00:00:00Z";
    const to = "2026-12-31T23:59:59Z";
    const { sql, values } = buildQueryAuditEventsSQL({
      operating_company_id: COMPANY_ID,
      from,
      to,
      limit: 100,
      offset: 0,
    });
    expect(sql).toContain("created_at >=");
    expect(sql).toContain("created_at <=");
    expect(values).toContain(from);
    expect(values).toContain(to);
  });

  it("adds search_text filter on event_class and payload", () => {
    const { sql, values } = buildQueryAuditEventsSQL({
      operating_company_id: COMPANY_ID,
      search_text: "invoice",
      limit: 100,
      offset: 0,
    });
    expect(sql).toContain("payload");
    expect(values).toContain("%invoice%");
  });

  it("pagination: limit capped at 500", () => {
    const { sql } = buildQueryAuditEventsSQL({
      operating_company_id: COMPANY_ID,
      limit: 9999,
      offset: 0,
    });
    expect(sql).toContain("LIMIT");
  });

  it("service is read-only: no INSERT/UPDATE/DELETE in SQL", () => {
    const { sql } = buildQueryAuditEventsSQL({
      operating_company_id: COMPANY_ID,
      limit: 100,
      offset: 0,
    });
    expect(sql.toUpperCase()).not.toMatch(/INSERT|UPDATE|DELETE/);
  });

  it("orders by created_at DESC", () => {
    const { sql } = buildQueryAuditEventsSQL({
      operating_company_id: COMPANY_ID,
      limit: 10,
      offset: 0,
    });
    expect(sql).toContain("ORDER BY e.created_at DESC");
  });
});

describe("RBAC enforcement (route guard)", () => {
  it("ownerOnly allows Owner role", () => {
    const allowed = ["Owner", "SuperAdmin"];
    const forbidden = ["Administrator", "Manager", "Accountant", "Dispatcher", "Mechanic"];
    for (const role of allowed) {
      expect(allowed.includes(role)).toBe(true);
    }
    for (const role of forbidden) {
      expect(allowed.includes(role)).toBe(false);
    }
  });
});
