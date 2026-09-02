import { describe, expect, it, vi } from "vitest";

import {
  TrailerInterchangeError,
  attachInterchangeTrailerToLoad,
  createNonOwnedTrailer,
  recordInterchangeReceipt,
  recordInterchangeReturn,
  voidTrailerInterchange,
} from "../trailer-interchange.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LOAD_ID = "11111111-1111-1111-1111-111111111111";
const TRAILER_ID = "22222222-2222-2222-2222-222222222222";
const VENDOR_ID = "33333333-3333-3333-3333-333333333333";
const INTERCHANGE_ID = "44444444-4444-4444-4444-444444444444";
const USER_ID = "55555555-5555-5555-5555-555555555555";

function makeClient(overrides: { interchangeStatus?: string; interchangeVoided?: boolean } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      if (/SELECT audit\.append_event/.test(sql)) return { rows: [] };
      if (/SELECT id FROM mdata\.vendors/.test(sql)) return { rows: [{ id: VENDOR_ID }] };
      if (/SELECT id FROM mdata\.customers/.test(sql)) return { rows: [] }; // used in the "not found" test
      if (/INSERT INTO dispatch\.non_owned_trailers/.test(sql)) return { rows: [{ id: TRAILER_ID }] };
      if (/SELECT id FROM mdata\.loads/.test(sql)) return { rows: [{ id: LOAD_ID }] };
      if (/SELECT id FROM dispatch\.non_owned_trailers WHERE/.test(sql)) return { rows: [{ id: TRAILER_ID }] };
      if (/INSERT INTO dispatch\.trailer_interchanges/.test(sql)) return { rows: [{ id: INTERCHANGE_ID }] };
      if (/SELECT id, status, voided_at::text FROM dispatch\.trailer_interchanges/.test(sql)) {
        return {
          rows: [
            {
              id: INTERCHANGE_ID,
              status: overrides.interchangeStatus ?? "pending_receipt",
              voided_at: overrides.interchangeVoided ? "2026-09-01T00:00:00Z" : null,
            },
          ],
        };
      }
      if (/SELECT id, voided_at::text FROM dispatch\.trailer_interchanges/.test(sql)) {
        return { rows: [{ id: INTERCHANGE_ID, voided_at: overrides.interchangeVoided ? "2026-09-01T00:00:00Z" : null }] };
      }
      if (/UPDATE dispatch\.trailer_interchanges/.test(sql)) return { rows: [] };
      return { rows: [] };
    }),
  };
  return { client, calls };
}

describe("trailer interchange — GO-21 A1", () => {
  it("creates a non-owned trailer only after confirming the counterparty exists, never touching mdata.units", async () => {
    const { client, calls } = makeClient();
    const result = await createNonOwnedTrailer(client as never, {
      operating_company_id: OPCO,
      trailer_number: "BRK-1234",
      counterparty_type: "vendor",
      counterparty_id: VENDOR_ID,
      created_by_user_id: USER_ID,
    });
    expect(result.id).toBe(TRAILER_ID);
    expect(calls.some((c) => /mdata\.units/.test(c.sql))).toBe(false);
    expect(calls.some((c) => /INSERT INTO dispatch\.non_owned_trailers/.test(c.sql))).toBe(true);
    expect(calls.some((c) => /SELECT audit\.append_event/.test(c.sql))).toBe(true);
  });

  it("refuses to create a non-owned trailer for a counterparty that does not exist", async () => {
    const { client } = makeClient();
    await expect(
      createNonOwnedTrailer(client as never, {
        operating_company_id: OPCO,
        trailer_number: "BRK-9999",
        counterparty_type: "customer",
        counterparty_id: "99999999-9999-9999-9999-999999999999",
        created_by_user_id: USER_ID,
      })
    ).rejects.toMatchObject({ code: "counterparty_not_found" });
  });

  it("attaches a non-owned trailer to a load in pending_receipt status", async () => {
    const { client } = makeClient();
    const result = await attachInterchangeTrailerToLoad(client as never, {
      operating_company_id: OPCO,
      load_id: LOAD_ID,
      non_owned_trailer_id: TRAILER_ID,
      created_by_user_id: USER_ID,
    });
    expect(result.status).toBe("pending_receipt");
  });

  it("recordInterchangeReceipt requires received_from and moves status to active", async () => {
    const { client: emptyClient } = makeClient({ interchangeStatus: "pending_receipt" });
    await expect(
      recordInterchangeReceipt(emptyClient as never, {
        operating_company_id: OPCO,
        interchange_id: INTERCHANGE_ID,
        received_from: "",
        actor_user_id: USER_ID,
      })
    ).rejects.toMatchObject({ code: "received_from_required" });

    const { client } = makeClient({ interchangeStatus: "pending_receipt" });
    const result = await recordInterchangeReceipt(client as never, {
      operating_company_id: OPCO,
      interchange_id: INTERCHANGE_ID,
      received_from: "Broker dispatcher Jane Doe",
      actor_user_id: USER_ID,
    });
    expect(result.status).toBe("active");
  });

  it("refuses to receive an interchange that is already active", async () => {
    const { client } = makeClient({ interchangeStatus: "active" });
    await expect(
      recordInterchangeReceipt(client as never, {
        operating_company_id: OPCO,
        interchange_id: INTERCHANGE_ID,
        received_from: "someone",
        actor_user_id: USER_ID,
      })
    ).rejects.toMatchObject({ code: "interchange_already_received" });
  });

  it("recordInterchangeReturn requires the interchange to be active first", async () => {
    const { client } = makeClient({ interchangeStatus: "pending_receipt" });
    await expect(
      recordInterchangeReturn(client as never, {
        operating_company_id: OPCO,
        interchange_id: INTERCHANGE_ID,
        actor_user_id: USER_ID,
      })
    ).rejects.toMatchObject({ code: "interchange_not_active" });
  });

  it("recordInterchangeReturn succeeds from active and moves status to returned", async () => {
    const { client } = makeClient({ interchangeStatus: "active" });
    const result = await recordInterchangeReturn(client as never, {
      operating_company_id: OPCO,
      interchange_id: INTERCHANGE_ID,
      condition_out: "Minor scuff, otherwise good.",
      actor_user_id: USER_ID,
    });
    expect(result.status).toBe("returned");
  });

  it("void requires a reason and never issues a DELETE", async () => {
    const { client: noReasonClient } = makeClient();
    await expect(
      voidTrailerInterchange(noReasonClient as never, {
        operating_company_id: OPCO,
        interchange_id: INTERCHANGE_ID,
        reason: "",
        actor_user_id: USER_ID,
      })
    ).rejects.toMatchObject({ code: "void_reason_required" });

    const { client, calls } = makeClient();
    const result = await voidTrailerInterchange(client as never, {
      operating_company_id: OPCO,
      interchange_id: INTERCHANGE_ID,
      reason: "Duplicate entry, wrong trailer number",
      actor_user_id: USER_ID,
    });
    expect(result.voided).toBe(true);
    expect(calls.some((c) => /DELETE FROM/i.test(c.sql))).toBe(false);
  });

  it("refuses to void an already-voided interchange", async () => {
    const { client } = makeClient({ interchangeVoided: true });
    await expect(
      voidTrailerInterchange(client as never, {
        operating_company_id: OPCO,
        interchange_id: INTERCHANGE_ID,
        reason: "again",
        actor_user_id: USER_ID,
      })
    ).rejects.toMatchObject({ code: "interchange_already_voided" });
  });

  it("TrailerInterchangeError is a real Error subclass carrying a stable .code", () => {
    const err = new TrailerInterchangeError("some_code", "some message");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("some_code");
  });
});
