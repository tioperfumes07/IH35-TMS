/**
 * SCENTSX B12 — KYC profile, W-9 / W-8, pagarés. Pure rule tests, then real Postgres (rolled back): a Mexican buyer goes from
 * incomplete to complete, the credit block carries the result and the held pagaré, a US vendor needs a W-9 + EIN, the wall refuses
 * another company's row, and only the Owner role can read the rows.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { addPagare, addTaxForm, closePagare, kycDesk, markKycReviewed, normalizeKyc, partyKyc, requirements, saveKyc, voidTaxForm, w8ExpiresOn, type KycProfile } from "./kyc.service.js";
import { creditExposure } from "./credit-exposure.service.js";

describe("KYC rules (pure)", () => {
  it("normalizes codes and refuses what no real ID can look like", () => {
    expect(normalizeKyc({ ein: "123456789", rfc: " goma800101ab1 ", country: "mx" })).toMatchObject({ ein: "12-3456789", rfc: "GOMA800101AB1", country: "MX" });
    expect(() => normalizeKyc({ ein: "12345" })).toThrow(/9 digits/);
    expect(() => normalizeKyc({ rfc: "ABC" })).toThrow(/RFC/);
    expect(() => normalizeKyc({ curp: "GOMA800101" })).toThrow(/CURP/);
    expect(() => normalizeKyc({ sales_tax_permit_state: "TX", sales_tax_permit_number: "123" })).toThrow(/11-digit/);
    expect(() => normalizeKyc({ ssn_itin_last4: "123456789" })).toThrow(/last 4/);
  });
  it("a W-8 is valid to Dec 31 of the third year after signing", () => {
    expect(w8ExpiresOn("2026-11-26")).toBe("2029-12-31");
  });
  it("lists exactly what each kind of party still needs", () => {
    const base = { id: "x", contact_company_id: "c", perfume_vendor_id: null, reviewed_at: null, updated_at: "", legal_name: "A", phone: "1", address_line: "s", city: "c", country: "MX" } as KycProfile;
    expect(requirements("customer", null, [], "2026-11-26").missing).toEqual(["kyc_profile"]);
    const mx = requirements("customer", { ...base, residency: "mexico", entity_kind: "individual", passport_expires_on: "2026-12-10" }, [], "2026-11-26");
    expect(mx.missing).toEqual(expect.arrayContaining(["rfc", "curp", "passport_number", "passport_copy", "visa_number", "W-8BEN"]));
    expect(mx.warnings).toEqual(["passport_expires_2026-12-10"]);
    const usb = requirements("customer", { ...base, country: "US", residency: "us", entity_kind: "business" }, [], "2026-11-26");
    expect(usb.missing).toEqual(["ein", "sales_tax_permit_number", "sales_tax_permit_copy"]);
    const vend = requirements("vendor", { ...base, country: "US", residency: "us", entity_kind: "business", ein: "12-3456789" },
      [{ id: "f", form_kind: "W-9", signed_on: "2026-01-02", expires_on: null, file_id: "f", voided_at: null }], "2026-11-26");
    expect(vend).toMatchObject({ status: "complete", missing: [] });
    const expired = requirements("vendor", { ...base, residency: "mexico", entity_kind: "business", rfc: "ABC800101AB1" },
      [{ id: "f", form_kind: "W-8BEN-E", signed_on: "2022-03-01", expires_on: "2025-12-31", file_id: "f", voided_at: null }], "2026-11-26");
    expect(expired.missing).toEqual(["W-8BEN-E_expired"]);
  });
});

describe("KYC, tax forms and pagarés (real Postgres, rolled back)", () => {
  let db: pg.Client;
  const u = TEST_OWNER_USER_ID;
  const file = async (name: string) =>
    (await db.query<{ id: string }>(
      `INSERT INTO docs.files (operating_company_id, original_filename, mime_type, size_bytes, r2_key, uploader_user_id)
       VALUES (scentsx.company_id(), $1, 'application/pdf', 1, $2, $3::uuid) RETURNING id::text`, [name, `test/${name}`, u]
    )).rows[0]!.id;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });

  it("a Mexican buyer goes from incomplete to complete; the credit block carries the result and the held pagaré", async () => {
    const cc = (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source) VALUES ('KYC test buyer', 'test') RETURNING id::text`)).rows[0]!.id;
    const party = { kind: "customer" as const, contact_company_id: cc };
    expect((await partyKyc(db, party)).status).toBe("none");

    const k1 = await saveKyc(db, u, party, { residency: "mexico", entity_kind: "individual", legal_name: "María Gómez", phone: "+52 867 000 0000",
      address_line: "Av. Guerrero 100", city: "Nuevo Laredo", state_region: "Tamaulipas", country: "mx", rfc: "goma800101ab1" });
    expect(k1.status).toBe("incomplete");
    expect(k1.profile).toMatchObject({ rfc: "GOMA800101AB1", country: "MX" });
    expect(k1.missing).toEqual(expect.arrayContaining(["curp", "passport_number", "visa_number", "W-8BEN"]));

    const k2 = await saveKyc(db, u, party, {
      curp: "GOMA800101MTSMRR09", passport_number: "g12345678", passport_country: "MX", passport_expires_on: "2031-05-01", passport_file_id: await file("pass.pdf"),
      visa_kind: "border_crossing_card", visa_number: "123456789", visa_expires_on: "2033-02-01", visa_file_id: await file("visa.pdf"),
    });
    expect(k2.missing).toEqual(["W-8BEN"]);
    await db.query("SAVEPOINT rev");
    await expect(markKycReviewed(db, u, party)).rejects.toThrow(/W-8BEN/);
    await db.query("ROLLBACK TO SAVEPOINT rev");

    await db.query("SAVEPOINT late");
    await expect(addTaxForm(db, u, party, { form_kind: "W-8BEN", signed_on: "2026-11-01", expires_on: "2031-01-01", file_id: await file("w8.pdf") })).rejects.toThrow(/2029-12-31/);
    await db.query("ROLLBACK TO SAVEPOINT late");
    const k3 = await addTaxForm(db, u, party, { form_kind: "W-8BEN", signed_on: "2026-11-01", file_id: await file("w8.pdf") });
    expect(k3).toMatchObject({ status: "complete", missing: [] });
    expect(k3.tax_forms[0]).toMatchObject({ form_kind: "W-8BEN", expires_on: "2029-12-31" });
    expect((await markKycReviewed(db, u, party)).profile!.reviewed_at).not.toBeNull();

    const pg1 = await addPagare(db, u, { contact_company_id: cc, amount_cents: 2_500_000, currency: "USD", issued_on: "2026-11-26", due_on: "2027-02-24",
      place_of_payment: "Laredo, Texas", suscriptor_name: "María Gómez", aval_name: "José Gómez", moratorio_rate_pct: 3, signed_file_id: await file("pagare.pdf") });
    expect(pg1.pagare_no).toMatch(/^PAG-2026-\d{4}$/);
    await addPagare(db, u, { contact_company_id: cc, amount_cents: 10_000_000, currency: "MXN", issued_on: "2026-11-26", place_of_payment: "Nuevo Laredo",
      suscriptor_name: "María Gómez", signed_file_id: await file("pagare2.pdf") });

    const ex = await creditExposure(db, cc);
    expect(ex).toMatchObject({ kyc_status: "complete", kyc_missing: [], pagare_held_usd_cents: 2_500_000, pagare_held_mxn_cents: 10_000_000, pagares_held: 2, exposure_cents: 0 });

    await db.query("SAVEPOINT shortnote");
    await expect(closePagare(db, u, pg1.id, "returned", "paid")).rejects.toThrow(/10 characters/);
    await db.query("ROLLBACK TO SAVEPOINT shortnote");
    await closePagare(db, u, pg1.id, "returned", "Credit account closed, balance paid in full");
    expect((await creditExposure(db, cc)).pagare_held_usd_cents).toBe(0);

    // An expired W-8 makes the profile incomplete again; voiding it does too.
    await voidTaxForm(db, u, k3.tax_forms[0]!.id, "Signed by the wrong person");
    expect((await partyKyc(db, party)).missing).toEqual(["W-8BEN"]);
  });

  it("a US vendor needs a W-9 and its EIN; the desk lists linked parties with their status", async () => {
    const v = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name) VALUES ('KYC test supplier') RETURNING id::text`)).rows[0]!.id;
    const party = { kind: "vendor" as const, perfume_vendor_id: v };
    const k = await saveKyc(db, u, party, { residency: "us", entity_kind: "business", legal_name: "KYC Test Supplier LLC", email: "ap@supplier.test",
      address_line: "1 Main", city: "Miami", country: "US" });
    expect(k.missing).toEqual(["W-9", "ein"]);
    await saveKyc(db, u, party, { ein: "98-7654321" });
    expect((await addTaxForm(db, u, party, { form_kind: "W-9", signed_on: "2026-11-02", file_id: await file("w9.pdf") })).status).toBe("complete");

    const sxVendor = (await db.query<{ id: string }>(
      `INSERT INTO mdata.vendors (vendor_name, vendor_type, operating_company_id, is_sample_data) VALUES ('KYC test supplier', 'Other', scentsx.company_id(), true) RETURNING id::text`
    )).rows[0]!.id;
    await db.query(`INSERT INTO scentsx.vendor_links (operating_company_id, perfume_vendor_id, vendor_id, created_by) VALUES (scentsx.company_id(), $1::uuid, $2::uuid, $3::uuid)`, [v, sxVendor, u]);
    const desk = await kycDesk(db);
    expect(desk.parties.find((p) => p.party_id === v)).toMatchObject({ kind: "vendor", engine_id: sxVendor, status: "complete" });
  });

  it("the wall refuses another company's row and only the Owner role reads the rows", async () => {
    const usmca = (await db.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE code <> 'SCENTSX' ORDER BY code LIMIT 1`)).rows[0]!.id;
    const cc = (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source) VALUES ('Wall KYC', 'test') RETURNING id::text`)).rows[0]!.id;
    await db.query("SAVEPOINT wall");
    await expect(db.query(
      `INSERT INTO scentsx.party_kyc (operating_company_id, contact_company_id, residency, entity_kind, legal_name) VALUES ($1::uuid, $2::uuid, 'us', 'business', 'X')`, [usmca, cc]
    )).rejects.toThrow(/must belong to SCENTSX/);
    await db.query("ROLLBACK TO SAVEPOINT wall");
    const pol = await db.query<{ qual: string }>(`SELECT qual FROM pg_policies WHERE schemaname = 'scentsx' AND tablename = 'party_kyc'`);
    expect(pol.rows).toHaveLength(1);
    expect(pol.rows[0]!.qual).toMatch(/'Owner'::identity\.role_enum/);
    expect(pol.rows[0]!.qual).not.toMatch(/Administrator/);
    const force = await db.query<{ f: boolean }>(`SELECT relforcerowsecurity AS f FROM pg_class WHERE oid = 'scentsx.party_kyc'::regclass`);
    expect(force.rows[0]!.f).toBe(true);
  });
});
