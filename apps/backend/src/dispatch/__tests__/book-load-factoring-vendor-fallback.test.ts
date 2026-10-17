import { describe, expect, it } from "vitest";
import { resolveFactoringVendorId } from "../book-load.service.js";
import { stampLoadFactoringVendorFromAdvance, FACTORING_VENDOR_STAMP_EVENT } from "../load-factoring-vendor-stamp.service.js";

// LEAD 443.197 1a — a load booked with no factoring pick takes its customer's factor (same company, active vendor
// only). FAIL-OLD: on origin/main resolveFactoringVendorId returned null for an empty pick without reading the customer,
// so every create path (Book Load, Settlement Creator seed, EDI) left factoring_company_vendor_id NULL.

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const CUST = "22222222-2222-4222-8222-222222222222";
const FARO = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";
const LOAD = "55555555-5555-4555-8555-555555555555";
const ADV = "66666666-6666-4666-8666-666666666666";
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";

type Call = { sql: string; values: unknown[] };
function fakeClient(route: (sql: string, values: unknown[]) => unknown[]) {
  const calls: Call[] = [];
  return {
    calls,
    query: async <T,>(sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      return { rows: route(sql, values) as T[] };
    },
  };
}

describe("resolveFactoringVendorId — customer-factor fallback (443.197 1a)", () => {
  it("no pick + customer with an active same-company factor → the customer's factor (FAIL-OLD: was null)", async () => {
    const c = fakeClient((sql, v) => (/get_customer_same_company/.test(sql) && v[0] === CUST && v[1] === CO ? [{ id: FARO }] : []));
    expect(await resolveFactoringVendorId(c, undefined, CO, CUST)).toBe(FARO);
    expect(await resolveFactoringVendorId(c, "   ", CO, CUST)).toBe(FARO);
    const sql = c.calls[0].sql;
    expect(sql).toMatch(/mdata\.get_customer_same_company\(\$1::uuid, \$2::uuid\)/);
    expect(sql).toMatch(/v\.operating_company_id = \$2::uuid/);
    expect(sql).toMatch(/v\.deactivated_at IS NULL/);
  });

  it("no pick + customer factor not resolvable in this company (cross-company / deactivated / none) → null", async () => {
    const c = fakeClient(() => []);
    expect(await resolveFactoringVendorId(c, undefined, CO, CUST)).toBeNull();
  });

  it("no pick + no / malformed customer id → null without a query", async () => {
    const c = fakeClient(() => {
      throw new Error("must not query");
    });
    expect(await resolveFactoringVendorId(c, undefined, CO, null)).toBeNull();
    expect(await resolveFactoringVendorId(c, undefined, CO, "not-a-uuid")).toBeNull();
  });

  it("an explicit pick still wins — the customer is never read", async () => {
    const c = fakeClient((sql) => (/get_customer_same_company/.test(sql) ? [{ id: FARO }] : [{ id: OTHER }]));
    expect(await resolveFactoringVendorId(c, OTHER, CO, CUST)).toBe(OTHER);
    expect(c.calls.some((x) => /get_customer_same_company/.test(x.sql))).toBe(false);
  });
});

describe("stampLoadFactoringVendorFromAdvance — narrow audited linkage writer (443.197 1a)", () => {
  function router(opts: { loadVendor?: string | null; advances?: Array<{ id: string; vendor_id: string | null }>; vendorActive?: boolean; custFactor?: string | null }) {
    return (sql: string): unknown[] => {
      if (/FROM mdata\.loads/.test(sql) && /FOR UPDATE/.test(sql)) return [{ load_number: "13546", customer_id: CUST, factoring_company_vendor_id: opts.loadVendor ?? null }];
      if (/accounting\.factoring_advances/.test(sql)) return opts.advances ?? [{ id: ADV, vendor_id: FARO }];
      if (/FROM mdata\.vendors/.test(sql)) return opts.vendorActive === false ? [] : [{ id: FARO }];
      if (/get_customer_same_company/.test(sql)) return [{ factor: opts.custFactor ?? null }];
      if (/UPDATE mdata\.loads/.test(sql)) return [{ id: LOAD }];
      if (/audit\.append_event/.test(sql)) return [];
      throw new Error(`unexpected sql: ${sql}`);
    };
  }
  const args = { operatingCompanyId: CO, loadId: LOAD, actorUserId: ACTOR, reason: "Lead 443.197: stamp from the live Faro advance" };

  it("customer with NO factor: the advance's factor is stamped + audited", async () => {
    const c = fakeClient(router({ custFactor: null }));
    const r = await stampLoadFactoringVendorFromAdvance(c, args);
    expect(r).toMatchObject({ status: "stamped", vendor_id: FARO, advance_ids: [ADV], customer_factor_vendor_id: null });
    const upd = c.calls.find((x) => /UPDATE mdata\.loads/.test(x.sql))!;
    expect(upd.sql).toMatch(/factoring_company_vendor_id IS NULL/);
    expect(upd.values).toEqual([LOAD, CO, FARO]);
    const audit = c.calls.find((x) => /audit\.append_event/.test(x.sql))!;
    expect(audit.values[0]).toBe(FACTORING_VENDOR_STAMP_EVENT);
    expect(JSON.parse(String(audit.values[2]))).toMatchObject({ new_value: FARO, advance_ids: [ADV], evidence: "live_factoring_advance" });
  });

  it("customer factor agrees → stamped", async () => {
    const r = await stampLoadFactoringVendorFromAdvance(fakeClient(router({ custFactor: FARO })), args);
    expect(r.status).toBe("stamped");
  });

  const refusals: Array<[string, Parameters<typeof router>[0], RegExp]> = [
    ["customer factor disagrees", { custFactor: OTHER }, /disagrees/],
    ["load already stamped", { loadVendor: OTHER }, /already carries/],
    ["no live advance", { advances: [] }, /no live factoring advance/],
    ["two factors across advances", { advances: [{ id: ADV, vendor_id: FARO }, { id: "77777777-7777-4777-8777-777777777777", vendor_id: OTHER }] }, /exactly one factor/],
    ["factor not an active same-company vendor", { vendorActive: false }, /not an active vendor of this company/],
  ];
  for (const [name, opts, re] of refusals) {
    it(`refuses — ${name} — and writes nothing`, async () => {
      const c = fakeClient(router(opts));
      const r = await stampLoadFactoringVendorFromAdvance(c, args);
      expect(r.status).toBe("refused");
      expect(r.reason).toMatch(re);
      expect(c.calls.some((x) => /UPDATE mdata\.loads|audit\.append_event/.test(x.sql))).toBe(false);
    });
  }

  it("requires a reason", async () => {
    await expect(stampLoadFactoringVendorFromAdvance(fakeClient(router({})), { ...args, reason: "short" })).rejects.toThrow(/requires_reason/);
  });
});
