import { describe, expect, it } from "vitest";
import {
  updateDispatchLoad,
  LoadEditLockedError,
  LoadNotFoundError,
} from "./update-load.service.js";

const LOAD_ID = "11111111-1111-1111-1111-111111111111";
const OCI = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const USER = "22222222-2222-2222-2222-222222222222";

type Row = Record<string, unknown>;
// A mock pg client that routes by SQL substring and records every statement it sees.
function makeClient(handlers: { match: RegExp; rows: Row[] }[]) {
  const sqls: string[] = [];
  const client = {
    async query<R = Row>(sql: string, _values?: unknown[]): Promise<{ rows: R[] }> {
      sqls.push(sql);
      for (const h of handlers) if (h.match.test(sql)) return { rows: h.rows as R[] };
      return { rows: [] as R[] };
    },
  };
  return { client, sqls };
}

const loadExists = { match: /SELECT \* FROM mdata\.loads WHERE id/, rows: [{ id: LOAD_ID, rate_total_cents: 100000 }] };
const noSettlement = { match: /FROM driver_finance\.driver_settlements/, rows: [] as Row[] };
const noInvoice = { match: /FROM accounting\.invoices/, rows: [] as Row[] };
const noBill = { match: /FROM driver_finance\.driver_bills/, rows: [] as Row[] };

describe("updateDispatchLoad — money/evidence guards", () => {
  it("throws LoadNotFoundError when the load does not exist", async () => {
    const { client } = makeClient([{ match: /SELECT \* FROM mdata\.loads WHERE id/, rows: [] }]);
    await expect(
      updateDispatchLoad(client, { loadId: LOAD_ID, operatingCompanyId: OCI, requestingUserUuid: USER, fields: { notes: "x" } })
    ).rejects.toBeInstanceOf(LoadNotFoundError);
  });

  it("blocks the edit (open_settlement) when an open load-bookended settlement bookends the load", async () => {
    const { client } = makeClient([
      loadExists,
      { match: /FROM driver_finance\.driver_settlements/, rows: [{ id: "s1", display_id: "SETT-1" }] },
    ]);
    await expect(
      updateDispatchLoad(client, { loadId: LOAD_ID, operatingCompanyId: OCI, requestingUserUuid: USER, fields: { notes: "x" } })
    ).rejects.toMatchObject({ lock: { reason: "open_settlement", reference_display_id: "SETT-1" } });
  });

  it("blocks the edit (issued_invoice) when a non-draft invoice is sourced from the load", async () => {
    const { client } = makeClient([
      loadExists,
      noSettlement,
      { match: /FROM accounting\.invoices/, rows: [{ id: "i1", display_id: "INV-9" }] },
    ]);
    await expect(
      updateDispatchLoad(client, { loadId: LOAD_ID, operatingCompanyId: OCI, requestingUserUuid: USER, fields: { notes: "x" } })
    ).rejects.toMatchObject({ lock: { reason: "issued_invoice", reference_display_id: "INV-9" } });
  });

  it("blocks the edit (driver_bill_locked) when a driver bill has moved past 'open'", async () => {
    const { client } = makeClient([
      loadExists,
      noSettlement,
      noInvoice,
      { match: /FROM driver_finance\.driver_bills/, rows: [{ id: "b1" }] },
    ]);
    await expect(
      updateDispatchLoad(client, { loadId: LOAD_ID, operatingCompanyId: OCI, requestingUserUuid: USER, fields: { notes: "x" } })
    ).rejects.toBeInstanceOf(LoadEditLockedError);
  });
});

describe("updateDispatchLoad — evidence-safe stops replace", () => {
  it("NEVER issues a DELETE against load_stops; archives removed stops via status='cancelled'", async () => {
    // Existing load has 3 stops; the edit submits 2 → stop #3 must be ARCHIVED, never deleted.
    const { client, sqls } = makeClient([
      loadExists,
      noSettlement,
      noInvoice,
      noBill,
      { match: /SELECT id::text, sequence_number FROM mdata\.load_stops/, rows: [
        { id: "st1", sequence_number: 1 },
        { id: "st2", sequence_number: 2 },
        { id: "st3", sequence_number: 3 },
      ] },
      { match: /SELECT id::text FROM mdata\.load_stops WHERE load_id = \$1::uuid AND sequence_number > /, rows: [{ id: "st3" }] },
      { match: /SELECT \* FROM mdata\.load_stops WHERE load_id/, rows: [] },
    ]);

    await updateDispatchLoad(client, {
      loadId: LOAD_ID,
      operatingCompanyId: OCI,
      requestingUserUuid: USER,
      fields: { notes: "edit" },
      stops: [
        { stop_type: "pickup", city: "Laredo", state: "TX" },
        { stop_type: "delivery", city: "Dallas", state: "TX" },
      ],
    });

    const joined = sqls.join("\n");
    // Hard rule: no DELETE against load_stops anywhere (would cascade-destroy POD/detention evidence).
    expect(/DELETE\s+FROM\s+mdata\.load_stops/i.test(joined)).toBe(false);
    // The removed stop is archived via a status='cancelled' UPDATE.
    expect(/UPDATE mdata\.load_stops[\s\S]*status = 'cancelled'/.test(joined)).toBe(true);
    // The audit event is recorded.
    expect(/audit\.append_event/.test(joined)).toBe(true);
  });
});
