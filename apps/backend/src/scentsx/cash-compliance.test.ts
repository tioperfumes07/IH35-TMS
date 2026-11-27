/**
 * SCENTSX B9 — Form 8300 engine against real Postgres (rolled back): what counts as cash, related receipts, the identity gate,
 * the 15-day due date, structuring alerts, voids, voluntary forms, filing.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import {
  CashComplianceBlocked, addCmirDeclaration, complianceDesk, createPayer, isMexicoCountry, markCaseFiled, missingIdentity, voidCmirDeclaration, openVoluntaryCase, recordCashReceipt, updatePayer, voidCashReceipt,
} from "./cash-compliance.service.js";

describe("missingIdentity (pure)", () => {
  it("an individual needs address, DOB, occupation, TIN and an ID copy; a business needs no DOB or ID", () => {
    expect(missingIdentity({ payer_kind: "individual", legal_name: "A" })).toEqual(
      ["address_line", "city", "country", "occupation", "tin_kind", "tin_last4", "date_of_birth", "id_type", "id_issuer", "id_number_last4", "id_copy_file_id"]
    );
    expect(missingIdentity({ payer_kind: "business", legal_name: "B", address_line: "1 Main", city: "Laredo", country: "US", occupation: "Retail perfume", tin_kind: "ein", tin_last4: "8798" })).toEqual([]);
    expect(missingIdentity({ payer_kind: "business", legal_name: "B", address_line: "x", city: "x", country: "MX", occupation: "x", tin_kind: "foreign_none" })).toEqual([]);
  });
});

describe("isMexicoCountry (pure)", () => {
  it("MX / MEX / Mexico / México count; the US and blanks do not", () => {
    expect(["MX", "mex", "Mexico", "México", " méxico "].every(isMexicoCountry)).toBe(true);
    expect(["US", "USA", "", null, undefined, "New Mexico"].some(isMexicoCountry)).toBe(false);
  });
});

describe("ScentsX Form 8300 engine (real Postgres, rolled back)", () => {
  let db: pg.Client;
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

  it("related cash over $10,000 needs identity first, then opens a case due in 15 days; a personal check never counts", async () => {
    const u = TEST_OWNER_USER_ID;
    const payer = await createPayer(db, u, { payer_kind: "individual", legal_name: "Cash Test Buyer" });
    expect(payer.identity_complete).toBe(false);

    const r1 = await recordCashReceipt(db, u, { payer_id: payer.id, received_at: "2026-11-20T15:00:00-06:00", payment_form: "currency_usd", amount_cents: 600000 });
    expect(r1).toMatchObject({ counts_as_cash: true, related_unreported_cents: 600000, case: null });
    expect(r1.receipt_no).toMatch(/^CR-\d{6}$/);

    const chk = await recordCashReceipt(db, u, { payer_id: payer.id, received_at: "2026-11-20T16:00:00-06:00", payment_form: "personal_check", amount_cents: 900000 });
    expect(chk).toMatchObject({ counts_as_cash: false, case: null });

    // A $5,000 money order not used in a consumer-durable retail sale and not known to be avoidance is not cash.
    const mo = await recordCashReceipt(db, u, { payer_id: payer.id, received_at: "2026-11-20T16:30:00-06:00", payment_form: "money_order", amount_cents: 500000, instrument_issuer: "USPS", instrument_serial: "MO-1" });
    expect(mo.counts_as_cash).toBe(false);

    // The second $6,000 of currency the same day takes related cash to $12,000 — refused until identity is complete.
    await db.query("SAVEPOINT blocked");
    await expect(recordCashReceipt(db, u, { payer_id: payer.id, received_at: "2026-11-20T18:00:00-06:00", payment_form: "currency_usd", amount_cents: 600000 }))
      .rejects.toBeInstanceOf(CashComplianceBlocked);
    await db.query("ROLLBACK TO SAVEPOINT blocked");

    const file = await db.query<{ id: string }>(
      `INSERT INTO docs.files (operating_company_id, original_filename, mime_type, size_bytes, r2_key, uploader_user_id)
       VALUES (scentsx.company_id(), 'id-copy-test.pdf', 'application/pdf', 1, 'test/id-copy-test.pdf', $1::uuid) RETURNING id::text`, [u]
    );
    const upd = await updatePayer(db, u, payer.id, {
      address_line: "1 Test St", city: "Laredo", country: "US", date_of_birth: "1980-01-01", occupation: "Perfume retailer",
      tin_kind: "ssn", tin_last4: "1234", id_type: "drivers_license", id_issuer: "Texas DPS", id_number_last4: "9876",
      id_copy_file_id: file.rows[0]!.id,
    });
    expect(upd.identity_complete).toBe(true);

    const r2 = await recordCashReceipt(db, u, { payer_id: payer.id, received_at: "2026-11-20T18:00:00-06:00", payment_form: "currency_usd", amount_cents: 600000 });
    expect(r2.case).toMatchObject({ total_cash_cents: 1200000, due_on: "2026-12-05" });
    expect(r2.case!.case_no).toMatch(/^F8300-2026-\d{6}$/);
    const onCase = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM scentsx.cash_receipts WHERE case_id = $1::uuid`, [r2.case!.id]);
    expect(onCase.rows[0]!.n).toBe("2");

    // After the case, counting starts again: a $3,000 receipt two days later is related to nothing unreported.
    const r3 = await recordCashReceipt(db, u, { payer_id: payer.id, received_at: "2026-11-22T10:00:00-06:00", payment_form: "currency_usd", amount_cents: 300000 });
    expect(r3).toMatchObject({ related_unreported_cents: 300000, case: null });

    // A receipt on a filed case cannot be voided; an unfiled one can, with a reason.
    await markCaseFiled(db, u, r2.case!.id, "BSA-TEST-1", null);
    await db.query("SAVEPOINT v");
    await expect(voidCashReceipt(db, u, r2.receipt_id, "typo")).rejects.toThrow(/filed Form 8300/);
    await db.query("ROLLBACK TO SAVEPOINT v");
    expect(await voidCashReceipt(db, u, r3.receipt_id, "entered twice")).toEqual({ voided: true });

    const desk = await complianceDesk(db);
    expect(desk.cases.find((x) => (x as { id: string }).id === r2.case!.id)).toMatchObject({ status: "filed", bsa_confirmation: "BSA-TEST-1" });
  });

  it("two receipts just under $10,000 within 30 days raise a structuring alert; a suspicious receipt can open a voluntary form", async () => {
    const u = TEST_OWNER_USER_ID;
    const payer = await createPayer(db, u, { payer_kind: "business", legal_name: "Structuring Test Co", address_line: "2 Test", city: "Laredo", country: "US", occupation: "Wholesale", tin_kind: "ein", tin_last4: "1111" });
    const a = await recordCashReceipt(db, u, { payer_id: payer.id, received_at: "2026-11-01T10:00:00-06:00", payment_form: "currency_usd", amount_cents: 950000 });
    expect(a.structuring_alert_id).toBeNull();
    const b = await recordCashReceipt(db, u, { payer_id: payer.id, received_at: "2026-11-05T10:00:00-06:00", payment_form: "currency_usd", amount_cents: 940000 });
    expect(b.case).toBeNull(); // 4 days apart and on no common order: not related, not reportable on their own
    expect(b.structuring_alert_id).not.toBeNull();

    const v = await openVoluntaryCase(db, u, b.receipt_id, "two payments just under $10,000 four days apart");
    expect(v.due_on).toBe("2026-11-20");
  });

  it("a Mexico payer's Form 8300 cannot be marked filed until their signed FinCEN 105 declaration is attached", async () => {
    const u = TEST_OWNER_USER_ID;
    const file = async (n: string) => (await db.query<{ id: string }>(
      `INSERT INTO docs.files (operating_company_id, original_filename, mime_type, size_bytes, r2_key, uploader_user_id)
       VALUES (scentsx.company_id(), $2, 'application/pdf', 1, 'test/' || $2, $1::uuid) RETURNING id::text`, [u, n]
    )).rows[0]!.id;
    const payer = await createPayer(db, u, { payer_kind: "business", legal_name: "Comprador Prueba SA", address_line: "Av. Test 1", city: "Nuevo Laredo", country: "México", occupation: "Perfumeria", tin_kind: "foreign_none" });
    const r = await recordCashReceipt(db, u, { payer_id: payer.id, received_at: "2026-11-24T11:00:00-06:00", payment_form: "currency_usd", amount_cents: 1500000 });
    expect(r.case).not.toBeNull();
    const caseId = r.case!.id;

    expect((await complianceDesk(db)).cases.find((x) => (x as { id: string }).id === caseId)).toMatchObject({ cmir_required: true, cmir_declaration_no: null });

    await db.query("SAVEPOINT f1");
    await expect(markCaseFiled(db, u, caseId, "BSA-MX-1", null)).rejects.toMatchObject({ missing: ["fincen105_declaration"] });
    await db.query("ROLLBACK TO SAVEPOINT f1");

    await db.query("SAVEPOINT f2");
    await expect(addCmirDeclaration(db, u, { case_id: caseId, crossed_on: "2026-11-24", port_of_entry: "Laredo", amount_declared_cents: 1500000, currency: "USD", signed_on: "2026-11-23", signed_declaration_file_id: await file("decl-bad.pdf") }))
      .rejects.toThrow(/signed on or after/);
    await db.query("ROLLBACK TO SAVEPOINT f2");

    const d = await addCmirDeclaration(db, u, { case_id: caseId, crossed_on: "2026-11-24", port_of_entry: "Laredo - Lincoln-Juarez Bridge", amount_declared_cents: 1500000, currency: "USD", signed_on: "2026-11-24", signed_declaration_file_id: await file("decl.pdf") });
    expect(d.declaration_no).toMatch(/^CMIR-2026-\d{4}$/);
    expect((await complianceDesk(db)).cases.find((x) => (x as { id: string }).id === caseId)).toMatchObject({ cmir_declaration_no: d.declaration_no });

    expect(await markCaseFiled(db, u, caseId, "BSA-MX-1", null)).toEqual({ filed: true });
    // Once the form is filed, its declaration cannot be voided.
    await db.query("SAVEPOINT f3");
    await expect(voidCmirDeclaration(db, u, d.id, "wrong file")).rejects.toThrow(/already filed/);
    await db.query("ROLLBACK TO SAVEPOINT f3");

    // A US payer's case needs no declaration (the first test files one without it).
  });

  it("the wall refuses a payer that names another company's customer", async () => {
    const u = TEST_OWNER_USER_ID;
    const otherCust = await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data)
       SELECT 'Wall test other-company customer', id, true FROM org.companies WHERE code <> 'SCENTSX' ORDER BY code LIMIT 1 RETURNING id::text`
    );
    expect(otherCust.rows[0]).toBeDefined();
    await db.query("SAVEPOINT w");
    await expect(createPayer(db, u, { payer_kind: "business", legal_name: "Wall Test Co", customer_id: otherCust.rows[0]!.id }))
      .rejects.toThrow(/customer of another company/);
    await db.query("ROLLBACK TO SAVEPOINT w");
  });
});
