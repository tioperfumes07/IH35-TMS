import { describe, it, expect, vi, beforeEach } from "vitest";

const isEnabledMock = vi.fn();
vi.mock("../lib/feature-flags/service.js", () => ({ isEnabled: (...a: unknown[]) => isEnabledMock(...a) }));

import { evaluateEntityPushGate, resolveEntityOrigin, type EntityKind } from "./qbo-entity-push-gate.js";

const OC = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const ID = "11111111-1111-4111-8111-111111111111";

// Mock client whose origin SELECT returns a configured signal (or no rows).
function client(signal: string | null | "MISSING") {
  return {
    lastSql: "",
    query: vi.fn(async function (this: { lastSql: string }, sql: string) {
      return { rows: signal === "MISSING" ? [] : [{ signal }] };
    }),
  };
}

describe("resolveEntityOrigin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invoice/bill use source_system: 'tms' → tms, anything else → qbo", async () => {
    expect(await resolveEntityOrigin(client("tms"), "invoice", OC, ID)).toBe("tms");
    expect(await resolveEntityOrigin(client("qbo"), "invoice", OC, ID)).toBe("qbo");
    expect(await resolveEntityOrigin(client("qbo_import"), "bill", OC, ID)).toBe("qbo");
  });

  it("masterdata uses qbo_id presence: set → qbo, null/empty → tms (approximate, fail-closed)", async () => {
    expect(await resolveEntityOrigin(client("869"), "customer", OC, ID)).toBe("qbo");
    expect(await resolveEntityOrigin(client(null), "customer", OC, ID)).toBe("tms");
    expect(await resolveEntityOrigin(client("  "), "vendor", OC, ID)).toBe("tms");
    expect(await resolveEntityOrigin(client("42"), "account", OC, ID)).toBe("qbo");
  });

  it("missing row → 'qbo' (fail closed — never push a row we cannot prove is TMS-origin)", async () => {
    expect(await resolveEntityOrigin(client("MISSING"), "item", OC, ID)).toBe("qbo");
  });

  it("queries the correct table + column per kind", async () => {
    const cases: Array<[EntityKind, RegExp]> = [
      ["invoice", /accounting\.invoices.*source_system|source_system.*accounting\.invoices/s],
      ["customer", /mdata\.customers.*qbo_customer_id|qbo_customer_id.*mdata\.customers/s],
      ["item", /catalogs\.items.*qbo_item_id|qbo_item_id.*catalogs\.items/s],
    ];
    for (const [kind, re] of cases) {
      const c = client("tms");
      await resolveEntityOrigin(c, kind, OC, ID);
      const sql = String(c.query.mock.calls[0][0]);
      expect(sql).toMatch(re);
    }
  });
});

describe("evaluateEntityPushGate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses a QBO-origin invoice even when the flag is ON, without checking the flag", async () => {
    const res = await evaluateEntityPushGate(client("qbo"), { operatingCompanyId: OC, entityKind: "invoice", entityId: ID });
    expect(res.decision).toBe("import_source");
    expect(isEnabledMock).not.toHaveBeenCalled();
  });

  it("refuses a QBO-origin (qbo_id set) customer even when the flag is ON", async () => {
    isEnabledMock.mockResolvedValue(true);
    const res = await evaluateEntityPushGate(client("869"), { operatingCompanyId: OC, entityKind: "customer", entityId: ID });
    expect(res.decision).toBe("import_source");
  });

  it("allows a TMS-origin invoice when the flag is ON", async () => {
    isEnabledMock.mockResolvedValue(true);
    const res = await evaluateEntityPushGate(client("tms"), { operatingCompanyId: OC, entityKind: "invoice", entityId: ID });
    expect(res.decision).toBe("allow");
  });

  it("flag_off for a TMS-origin row when the flag is OFF", async () => {
    isEnabledMock.mockResolvedValue(false);
    const res = await evaluateEntityPushGate(client(null), { operatingCompanyId: OC, entityKind: "vendor", entityId: ID });
    expect(res.decision).toBe("flag_off");
  });
});
