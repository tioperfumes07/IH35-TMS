import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Adversarial entity-scope tests for GET /accounting/invoices COUNT + LIST.
 *
 * verify-mdata-entity-scope only sees predicates inside SQL template literals.
 * These tests lock the explicit join/WHERE predicates and prove a simulated
 * cross-company join (same UUID-shaped ids, different operating companies)
 * cannot bleed customer names or attach foreign loads.
 */

const ROUTES = fs.readFileSync(path.resolve("apps/backend/src/accounting/invoices.routes.ts"), "utf8");

const COMPANY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
/** Same UUID string reused across companies in the fixture (proves predicate necessity). */
const SHARED_CUSTOMER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SHARED_LOAD_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const INVOICE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function extractListHandler(src: string): string {
  const start = src.indexOf('app.get("/api/v1/accounting/invoices"');
  const end = src.indexOf('app.get("/api/v1/accounting/invoices/:id"');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

function extractSqlLiterals(handler: string): { countSql: string; listSql: string } {
  const countMatch = handler.match(/SELECT COUNT\(\*\)::int AS total[\s\S]*?WHERE i\.operating_company_id = \$1[\s\S]*?\$\{extraSql\}/);
  const listMatch = handler.match(
    /SELECT\s+i\.\*,[\s\S]*?FROM accounting\.invoices i[\s\S]*?WHERE i\.operating_company_id = \$1[\s\S]*?OFFSET \$\$\{offsetIdx\}/
  );
  expect(countMatch?.[0], "COUNT SQL literal").toBeTruthy();
  expect(listMatch?.[0], "LIST SQL literal").toBeTruthy();
  return { countSql: countMatch![0], listSql: listMatch![0] };
}

function assertCustomerEntityPredicates(sql: string, label: string) {
  expect(sql, label).toMatch(/JOIN\s+mdata\.customers\s+c/i);
  expect(sql, label).toContain("c.operating_company_id = i.operating_company_id");
  expect(sql, label).toContain("c.operating_company_id = $1");
  expect(sql, label).toContain("i.operating_company_id = $1");
}

function assertLoadEntityPredicateOnJoin(sql: string) {
  expect(sql).toMatch(
    /LEFT\s+JOIN\s+mdata\.loads\s+l\s+ON\s+l\.id\s*=\s*i\.source_load_id\s+AND\s+l\.operating_company_id\s*=\s*i\.operating_company_id/i
  );
}

/** Simulate INNER JOIN customers with the production predicates. */
function scopedCustomerJoin(
  invoices: Array<{ id: string; operating_company_id: string; customer_id: string; source_load_id: string | null }>,
  customers: Array<{ id: string; operating_company_id: string; customer_name: string }>,
  companyId: string
) {
  return invoices
    .filter((i) => i.operating_company_id === companyId)
    .flatMap((i) => {
      const c = customers.find(
        (row) =>
          row.id === i.customer_id &&
          row.operating_company_id === i.operating_company_id &&
          row.operating_company_id === companyId
      );
      return c ? [{ invoice_id: i.id, customer_name: c.customer_name, source_load_id: i.source_load_id }] : [];
    });
}

/** Simulate LEFT JOIN loads with company predicate in ON (null load rows remain). */
function scopedLoadLeftJoin(
  rows: Array<{ invoice_id: string; customer_name: string; source_load_id: string | null }>,
  loads: Array<{ id: string; operating_company_id: string; load_number: string }>,
  invoiceCompanyId: string
) {
  return rows.map((r) => {
    const load =
      r.source_load_id == null
        ? null
        : loads.find((l) => l.id === r.source_load_id && l.operating_company_id === invoiceCompanyId) ?? null;
    return {
      ...r,
      load_number: load?.load_number ?? null,
    };
  });
}

describe("invoices list COUNT+LIST entity scope", () => {
  const handler = extractListHandler(ROUTES);
  const { countSql, listSql } = extractSqlLiterals(handler);

  it("COUNT SQL literal scopes customers to invoice + $1 and keeps i.operating_company_id=$1", () => {
    assertCustomerEntityPredicates(countSql, "COUNT");
    expect(countSql).not.toMatch(/mdata\.loads/);
  });

  it("LIST SQL literal scopes customers and puts load company predicate in LEFT JOIN ON", () => {
    assertCustomerEntityPredicates(listSql, "LIST");
    assertLoadEntityPredicateOnJoin(listSql);
    expect(listSql).toContain("i.operating_company_id = $1");
  });

  it("COUNT and LIST share equivalent filter surface (has_balance + extraWhere / extraSql)", () => {
    expect(handler).toContain("const extraSql = extraWhere.length ? `AND ${extraWhere.join(\" AND \")}` : \"\";");
    expect(countSql).toContain("${extraSql}");
    expect(listSql).toContain("${extraSql}");
    expect(handler).toContain("COALESCE(i.amount_open_cents, 0) > 0");
    // Bind $1 is company for both; LIMIT/OFFSET only on list after count.
    expect(handler.indexOf("SELECT COUNT(*)::int AS total")).toBeLessThan(handler.indexOf("LIMIT $${limitIdx}"));
  });

  it("adversarial: same customer UUID across companies cannot bleed foreign customer_name into company A list", () => {
    const customers = [
      { id: SHARED_CUSTOMER_ID, operating_company_id: COMPANY_A, customer_name: "Acme TRANSP" },
      { id: SHARED_CUSTOMER_ID, operating_company_id: COMPANY_B, customer_name: "Acme USMCA LEAK" },
    ];
    const invoices = [
      {
        id: INVOICE_ID,
        operating_company_id: COMPANY_A,
        customer_id: SHARED_CUSTOMER_ID,
        source_load_id: SHARED_LOAD_ID,
      },
    ];

    // Unscoped join-by-id alone would be ambiguous / could pick the wrong row depending on scan order.
    const unscoped = customers.filter((c) => c.id === SHARED_CUSTOMER_ID);
    expect(unscoped.map((c) => c.customer_name).sort()).toEqual(["Acme TRANSP", "Acme USMCA LEAK"]);

    const scoped = scopedCustomerJoin(invoices, customers, COMPANY_A);
    expect(scoped).toHaveLength(1);
    expect(scoped[0]!.customer_name).toBe("Acme TRANSP");
    expect(scoped[0]!.customer_name).not.toBe("Acme USMCA LEAK");
  });

  it("adversarial: cross-company customer row is excluded (no name bleed / invoice dropped from INNER JOIN)", () => {
    const customers = [
      { id: SHARED_CUSTOMER_ID, operating_company_id: COMPANY_B, customer_name: "Foreign Customer" },
    ];
    const invoices = [
      {
        id: INVOICE_ID,
        operating_company_id: COMPANY_A,
        customer_id: SHARED_CUSTOMER_ID,
        source_load_id: null,
      },
    ];
    expect(scopedCustomerJoin(invoices, customers, COMPANY_A)).toEqual([]);
  });

  it("adversarial: same load UUID in other company stays NULL on LEFT JOIN (invoice remains)", () => {
    const customers = [
      { id: SHARED_CUSTOMER_ID, operating_company_id: COMPANY_A, customer_name: "Acme TRANSP" },
    ];
    const invoices = [
      {
        id: INVOICE_ID,
        operating_company_id: COMPANY_A,
        customer_id: SHARED_CUSTOMER_ID,
        source_load_id: SHARED_LOAD_ID,
      },
    ];
    const loads = [
      { id: SHARED_LOAD_ID, operating_company_id: COMPANY_B, load_number: "L-FOREIGN" },
      { id: SHARED_LOAD_ID, operating_company_id: COMPANY_A, load_number: "L-HOME" },
    ];

    const joined = scopedLoadLeftJoin(scopedCustomerJoin(invoices, customers, COMPANY_A), loads, COMPANY_A);
    expect(joined).toHaveLength(1);
    expect(joined[0]!.customer_name).toBe("Acme TRANSP");
    expect(joined[0]!.load_number).toBe("L-HOME");

    // Foreign-only load universe → invoice kept, load fields null (LEFT JOIN ON company).
    const foreignOnly = scopedLoadLeftJoin(
      scopedCustomerJoin(invoices, customers, COMPANY_A),
      [{ id: SHARED_LOAD_ID, operating_company_id: COMPANY_B, load_number: "L-FOREIGN" }],
      COMPANY_A
    );
    expect(foreignOnly).toHaveLength(1);
    expect(foreignOnly[0]!.load_number).toBeNull();
  });
});
