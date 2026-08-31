import { describe, expect, it, vi } from "vitest";
import {
  updateDispatchLoad,
  LoadEditLockedError,
  LoadNotFoundError,
  isLiveLoadNumberOnlyPatch,
} from "./update-load.service.js";

// ACCT-F289 mint-if-empty path calls buildInvoiceFromLoad when no draft/proforma lines match.
// Unit tests mock SQL only — keep mint a no-op so rate-resync SQL assertions stay the subject.
vi.mock("../accounting/from-load.js", () => ({
  buildInvoiceFromLoad: vi.fn(async () => ({ idempotent: true, invoice: { id: "inv-mock" } })),
}));

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
// DRV-BILL-SKIP-PATHS re-entry read (ensureDriverBillArtifactsForLoad) — no driver/team seated, so it
// short-circuits to `not_applicable` without any further stops/advisory-lock/bill queries.
const driverBillReentryNoDriver = {
  match: /requires_tarps, miles_shortest, miles_practical/,
  rows: [{ id: LOAD_ID, operating_company_id: OCI, assigned_primary_driver_id: null, team_id: null }],
};

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

  it("allows Owner to override open_settlement lock for non-money fields with audit", async () => {
    const auditSqls: string[] = [];
    const { client, sqls } = makeClient([
      loadExists,
      { match: /FROM driver_finance\.driver_settlements/, rows: [{ id: "s1", display_id: "SETT-1" }] },
      { match: /UPDATE mdata\.loads SET/, rows: [{ id: LOAD_ID }] },
      { match: /SELECT \* FROM mdata\.loads WHERE id/, rows: [{ id: LOAD_ID, rate_total_cents: 100000 }] },
      { match: /SELECT \* FROM mdata\.load_stops WHERE load_id/, rows: [] },
      driverBillReentryNoDriver,
    ]);
    const origQuery = client.query.bind(client);
    client.query = async (sql: string, values?: unknown[]) => {
      if (/audit\.append_event/.test(sql)) auditSqls.push(String(values?.[0] ?? ""));
      return origQuery(sql, values);
    };
    await updateDispatchLoad(client, {
      loadId: LOAD_ID,
      operatingCompanyId: OCI,
      requestingUserUuid: USER,
      requestingUserRole: "Owner",
      fields: { notes: "owner override" },
    });
    expect(auditSqls.some((e) => e === "dispatch.load.edit_owner_override")).toBe(true);
    expect(sqls.some((s) => /UPDATE mdata\.loads SET/.test(s))).toBe(true);
  });

  it("blocks Owner from changing miles behind an issued invoice (WORM — reverse document first)", async () => {
    const { client } = makeClient([
      loadExists,
      noSettlement,
      { match: /FROM accounting\.invoices/, rows: [{ id: "i1", display_id: "INV-9" }] },
    ]);
    await expect(
      updateDispatchLoad(client, {
        loadId: LOAD_ID,
        operatingCompanyId: OCI,
        requestingUserUuid: USER,
        requestingUserRole: "Owner",
        fields: { miles_practical: 500 },
      })
    ).rejects.toMatchObject({ lock: { reason: "issued_invoice", reference_display_id: "INV-9" } });
  });

  it("blocks Owner from changing charges behind an open settlement", async () => {
    const { client } = makeClient([
      loadExists,
      { match: /FROM driver_finance\.driver_settlements/, rows: [{ id: "s1", display_id: "SETT-1" }] },
    ]);
    await expect(
      updateDispatchLoad(client, {
        loadId: LOAD_ID,
        operatingCompanyId: OCI,
        requestingUserUuid: USER,
        requestingUserRole: "Owner",
        charges: [{ code: "LINEHAUL", amount_cents: 120000 }],
        fields: {},
      })
    ).rejects.toMatchObject({ lock: { reason: "open_settlement" } });
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

  it("allows live_load_number-only backfill when an open settlement would otherwise lock the load", async () => {
    expect(
      isLiveLoadNumberOnlyPatch({
        loadId: LOAD_ID,
        operatingCompanyId: OCI,
        requestingUserUuid: USER,
        fields: { live_load_number: "L-20260830-0014" },
      }),
    ).toBe(true);
    expect(
      isLiveLoadNumberOnlyPatch({
        loadId: LOAD_ID,
        operatingCompanyId: OCI,
        requestingUserUuid: USER,
        fields: { live_load_number: "L-20260830-0014", notes: "x" },
      }),
    ).toBe(false);

    const { client, sqls } = makeClient([
      loadExists,
      { match: /UPDATE mdata\.loads SET/, rows: [{ id: LOAD_ID }] },
      { match: /SELECT \* FROM mdata\.loads WHERE id/, rows: [{ id: LOAD_ID, rate_total_cents: 100000 }] },
      { match: /SELECT \* FROM mdata\.load_stops WHERE load_id/, rows: [] },
      driverBillReentryNoDriver,
    ]);

    await updateDispatchLoad(client, {
      loadId: LOAD_ID,
      operatingCompanyId: OCI,
      requestingUserUuid: USER,
      fields: { live_load_number: "L-20260830-0014" },
    });

    expect(sqls.some((s) => /FROM driver_finance\.driver_settlements/.test(s))).toBe(false);
    expect(sqls.some((s) => /live_load_number/.test(s))).toBe(true);
  });
});

describe("updateDispatchLoad — rate re-sync", () => {
  it("re-syncs unsent draft+proforma from-load invoices when rate_total_cents changes", async () => {
    const { client, sqls } = makeClient([
      { match: /SELECT \* FROM mdata\.loads WHERE id/, rows: [{ id: LOAD_ID, rate_total_cents: 100000 }] },
      { match: /FROM driver_finance\.driver_settlements/, rows: [] as Row[] },
      { match: /FROM accounting\.invoices/, rows: [] as Row[] },
      { match: /FROM driver_finance\.driver_bills/, rows: [] as Row[] },
      { match: /SELECT id FROM dispatch\.load_charge_lines[\s\S]*FOR UPDATE/, rows: [] as Row[] },
      { match: /UPDATE dispatch\.load_charge_lines SET is_active = false[\s\S]*RETURNING id/, rows: [] as Row[] },
      { match: /INSERT INTO dispatch\.load_charge_lines[\s\S]*RETURNING id/, rows: [{ id: "cl1" }] },
      { match: /UPDATE mdata\.loads SET/, rows: [{ id: LOAD_ID }] },
      { match: /SELECT \* FROM mdata\.loads WHERE id/, rows: [{ id: LOAD_ID, rate_total_cents: 120000 }] },
      { match: /UPDATE accounting\.invoice_lines/, rows: [{ invoice_id: "inv1" }] },
      { match: /SELECT.*FROM accounting\.invoice_lines/, rows: [] as Row[] },
      { match: /UPDATE accounting\.invoices SET/, rows: [] as Row[] },
      { match: /SELECT id::text, sequence_number FROM mdata\.load_stops/, rows: [] as Row[] },
      { match: /SELECT id::text FROM mdata\.load_stops WHERE load_id/, rows: [] as Row[] },
      { match: /SELECT \* FROM mdata\.load_stops WHERE load_id/, rows: [] as Row[] },
      driverBillReentryNoDriver,
    ]);

    await updateDispatchLoad(client, {
      loadId: LOAD_ID,
      operatingCompanyId: OCI,
      requestingUserUuid: USER,
      fields: { notes: "rate changed" },
      charges: [{ code: "LINEHAUL", amount_cents: 120000 }],
    });

    const joined = sqls.join("\n");
    expect(joined).toMatch(/UPDATE accounting\.invoice_lines[\s\S]*unit_amount_cents[\s\S]*line_total_cents/);
    expect(joined).toMatch(/i\.status\s+IN\s*\(\s*['"]draft['"]\s*,\s*['"]proforma['"]\s*\)/i);
    expect(joined).toMatch(/FROM accounting\.invoices i/);
  });

  it("does not re-sync sent invoices when rate_total_cents changes", async () => {
    const { client, sqls } = makeClient([
      { match: /SELECT \* FROM mdata\.loads WHERE id/, rows: [{ id: LOAD_ID, rate_total_cents: 100000 }] },
      { match: /FROM driver_finance\.driver_settlements/, rows: [] as Row[] },
      { match: /FROM accounting\.invoices/, rows: [] as Row[] },
      { match: /FROM driver_finance\.driver_bills/, rows: [] as Row[] },
      { match: /SELECT id FROM dispatch\.load_charge_lines[\s\S]*FOR UPDATE/, rows: [] as Row[] },
      { match: /UPDATE dispatch\.load_charge_lines SET is_active = false[\s\S]*RETURNING id/, rows: [] as Row[] },
      { match: /INSERT INTO dispatch\.load_charge_lines[\s\S]*RETURNING id/, rows: [{ id: "cl1" }] },
      { match: /UPDATE mdata\.loads SET/, rows: [{ id: LOAD_ID }] },
      { match: /SELECT \* FROM mdata\.loads WHERE id/, rows: [{ id: LOAD_ID, rate_total_cents: 120000 }] },
      { match: /SELECT id::text, sequence_number FROM mdata\.load_stops/, rows: [] as Row[] },
      { match: /SELECT id::text FROM mdata\.load_stops WHERE load_id/, rows: [] as Row[] },
      { match: /SELECT \* FROM mdata\.load_stops WHERE load_id/, rows: [] as Row[] },
      driverBillReentryNoDriver,
    ]);

    await updateDispatchLoad(client, {
      loadId: LOAD_ID,
      operatingCompanyId: OCI,
      requestingUserUuid: USER,
      fields: { notes: "rate changed" },
      charges: [{ code: "LINEHAUL", amount_cents: 120000 }],
    });

    const joined = sqls.join("\n");
    const resyncBlock = joined.match(/UPDATE accounting\.invoice_lines[\s\S]*?RETURNING i\.id::text AS invoice_id/);
    expect(resyncBlock).toBeTruthy();
    expect(resyncBlock![0]).toMatch(/i\.status\s+IN\s*\(\s*['"]draft['"]\s*,\s*['"]proforma['"]\s*\)/i);
    expect(resyncBlock![0]).not.toMatch(/['"]sent['"]|['"]partial['"]|['"]paid['"]|['"]factored['"]/i);
  });
});

describe("updateDispatchLoad — evidence-safe stops replace", () => {
  it("NEVER issues a DELETE against load_stops; archives removed stops via status='cancelled'", async () => {
    // Existing load has 2 stops; the edit submits 1 → stop #2 must be ARCHIVED, never deleted.
    const { client, sqls } = makeClient([
      loadExists,
      noSettlement,
      noInvoice,
      noBill,
      { match: /UPDATE mdata\.loads SET/, rows: [{ id: LOAD_ID }] },
      { match: /SELECT id::text, sequence_number FROM mdata\.load_stops/, rows: [
        { id: "st1", sequence_number: 1 },
        { id: "st2", sequence_number: 2 },
      ] },
      { match: /UPDATE mdata\.load_stops SET[\s\S]*WHERE id = \$1::uuid/, rows: [
        { id: "st1" },
      ] },
      { match: /SELECT id::text FROM mdata\.load_stops WHERE load_id = \$1::uuid AND sequence_number > /, rows: [{ id: "st2" }] },
      { match: /UPDATE mdata\.load_stops[\s\S]*id = ANY/, rows: [{ id: "st2" }] },
      { match: /SELECT \* FROM mdata\.load_stops WHERE load_id/, rows: [] },
      driverBillReentryNoDriver,
    ]);

    await updateDispatchLoad(client, {
      loadId: LOAD_ID,
      operatingCompanyId: OCI,
      requestingUserUuid: USER,
      fields: { notes: "edit" },
      stops: [
        { stop_type: "pickup", city: "Laredo", state: "TX" },
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

  it("rejects a zero-row scalar write instead of re-reading the old load as success", async () => {
    const { client } = makeClient([
      loadExists,
      noSettlement,
      noInvoice,
      noBill,
      { match: /UPDATE mdata\.loads SET/, rows: [] },
    ]);

    await expect(updateDispatchLoad(client, {
      loadId: LOAD_ID,
      operatingCompanyId: OCI,
      requestingUserUuid: USER,
      fields: { notes: "must persist" },
    })).rejects.toMatchObject({ code: "E_LOAD_WRITE_CONFLICT" });
  });

  it("rejects a missing existing-stop identity instead of counting it as updated", async () => {
    const { client } = makeClient([
      loadExists,
      noSettlement,
      noInvoice,
      noBill,
      { match: /UPDATE mdata\.loads SET/, rows: [{ id: LOAD_ID }] },
      { match: /SELECT id::text, sequence_number FROM mdata\.load_stops/, rows: [{ id: "st1", sequence_number: 1 }] },
      { match: /UPDATE mdata\.load_stops SET[\s\S]*WHERE id = \$1::uuid/, rows: [] },
    ]);

    await expect(updateDispatchLoad(client, {
      loadId: LOAD_ID,
      operatingCompanyId: OCI,
      requestingUserUuid: USER,
      fields: { notes: "edit" },
      stops: [{ stop_type: "pickup", city: "Laredo", state: "TX" }],
    })).rejects.toMatchObject({ code: "E_LOAD_STOP_WRITE_CONFLICT" });
  });

  it("rejects a missing inserted-stop identity instead of counting it as inserted", async () => {
    const { client } = makeClient([
      loadExists,
      noSettlement,
      noInvoice,
      noBill,
      { match: /UPDATE mdata\.loads SET/, rows: [{ id: LOAD_ID }] },
      { match: /SELECT id::text, sequence_number FROM mdata\.load_stops/, rows: [] },
      { match: /INSERT INTO mdata\.load_stops/, rows: [] },
    ]);

    await expect(updateDispatchLoad(client, {
      loadId: LOAD_ID,
      operatingCompanyId: OCI,
      requestingUserUuid: USER,
      fields: { notes: "edit" },
      stops: [{ stop_type: "pickup", city: "Laredo", state: "TX" }],
    })).rejects.toMatchObject({ code: "E_LOAD_STOP_WRITE_CONFLICT" });
  });

  it("rejects a partial stop archive instead of reporting the selected count", async () => {
    const { client } = makeClient([
      loadExists,
      noSettlement,
      noInvoice,
      noBill,
      { match: /UPDATE mdata\.loads SET/, rows: [{ id: LOAD_ID }] },
      { match: /SELECT id::text, sequence_number FROM mdata\.load_stops/, rows: [
        { id: "st1", sequence_number: 1 },
        { id: "st2", sequence_number: 2 },
      ] },
      { match: /UPDATE mdata\.load_stops SET[\s\S]*WHERE id = \$1::uuid/, rows: [{ id: "st1" }] },
      { match: /SELECT id::text FROM mdata\.load_stops WHERE load_id = \$1::uuid AND sequence_number > /, rows: [{ id: "st2" }] },
      { match: /UPDATE mdata\.load_stops[\s\S]*id = ANY/, rows: [] },
    ]);

    await expect(updateDispatchLoad(client, {
      loadId: LOAD_ID,
      operatingCompanyId: OCI,
      requestingUserUuid: USER,
      fields: { notes: "edit" },
      stops: [{ stop_type: "pickup", city: "Laredo", state: "TX" }],
    })).rejects.toMatchObject({ code: "E_LOAD_STOP_ARCHIVE_CONFLICT" });
  });
});
