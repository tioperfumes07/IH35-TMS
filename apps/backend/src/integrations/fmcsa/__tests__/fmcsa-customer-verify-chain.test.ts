import { beforeEach, describe, expect, it, vi } from "vitest";

const appendCrudAudit = vi.fn(async () => undefined);

vi.mock("../../../audit/crud-audit.js", () => ({
  appendCrudAudit: (...args: unknown[]) => appendCrudAudit(...args),
}));

const OPCO = "00000000-0000-4000-8000-0000000000a1";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const ACTOR = "00000000-0000-4000-8000-0000000000d1";

describe("enqueueFmcsaCustomerVerifyRequested", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds stable fingerprint + dedupe key", async () => {
    const { buildFmcsaLookupFingerprint, buildFmcsaVerifyDedupeKey } = await import(
      "../fmcsa-customer-verify-chain.service.js"
    );
    expect(buildFmcsaLookupFingerprint("MC-12345", "1234567")).toBe("mc=12345|dot=1234567");
    expect(
      buildFmcsaVerifyDedupeKey({
        operating_company_id: OPCO,
        customer_id: CUSTOMER,
        lookup_fingerprint: "mc=12345|dot=1234567",
      })
    ).toBe(`fmcsa.customer.verify:${OPCO}:${CUSTOMER}:mc=12345|dot=1234567`);
  });

  it("uses ON CONFLICT WHERE dedupe_key IS NOT NULL (matches partial unique index)", async () => {
    const { enqueueFmcsaCustomerVerifyRequested, FMCSA_CUSTOMER_VERIFY_EVENT_TYPE } = await import(
      "../fmcsa-customer-verify-chain.service.js"
    );
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO outbox.events")) {
        expect(sql).toMatch(/ON CONFLICT\s*\(\s*dedupe_key\s*\)\s*WHERE\s+dedupe_key\s+IS\s+NOT\s+NULL\s+DO\s+NOTHING/i);
        return { rows: [{ id: "evt-new" }] };
      }
      return { rows: [] };
    });
    const result = await enqueueFmcsaCustomerVerifyRequested({ query } as never, {
      operating_company_id: OPCO,
      customer_id: CUSTOMER,
      actor_user_id: ACTOR,
      trigger: "create",
      lookup_fingerprint: "mc=1|dot=",
    });
    expect(result).toEqual({
      enqueued: true,
      deduped: false,
      outbox_event_id: "evt-new",
      dedupe_key: `fmcsa.customer.verify:${OPCO}:${CUSTOMER}:mc=1|dot=`,
    });
    expect(query.mock.calls[0]?.[1]?.[0]).toBe(FMCSA_CUSTOMER_VERIFY_EVENT_TYPE);
    expect(appendCrudAudit).toHaveBeenCalledWith(
      expect.anything(),
      ACTOR,
      "mdata.customer.fmcsa_verify_enqueued",
      expect.objectContaining({ outbox_event_id: "evt-new" }),
      "info",
      "ACCT-FMCSA-FIRE-AND-FORGET-RETRY"
    );
  });

  it("audits dedupe when conflict suppresses insert (no probe-only race path)", async () => {
    const { enqueueFmcsaCustomerVerifyRequested } = await import("../fmcsa-customer-verify-chain.service.js");
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO outbox.events")) return { rows: [] };
      if (sql.includes("SELECT id::text AS id")) return { rows: [{ id: "evt-pending" }] };
      return { rows: [] };
    });
    const result = await enqueueFmcsaCustomerVerifyRequested({ query } as never, {
      operating_company_id: OPCO,
      customer_id: CUSTOMER,
      actor_user_id: ACTOR,
      trigger: "update",
      lookup_fingerprint: "mc=9|dot=9",
    });
    expect(result.enqueued).toBe(false);
    expect(result.deduped).toBe(true);
    expect(result.outbox_event_id).toBe("evt-pending");
    expect(appendCrudAudit).toHaveBeenCalledWith(
      expect.anything(),
      ACTOR,
      "mdata.customer.fmcsa_verify_deduped",
      expect.objectContaining({ outbox_event_id: "evt-pending" }),
      "info",
      "ACCT-FMCSA-FIRE-AND-FORGET-RETRY"
    );
  });
});
