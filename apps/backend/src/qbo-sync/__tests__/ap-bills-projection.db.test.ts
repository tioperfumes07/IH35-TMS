/**
 * QBO-AP-PULL Stage 2 — inbound A/P projection into the aging subledger (real Postgres).
 *
 * Proves the ONE thing that turns TMS A/P from $0 into QBO's authoritative open A/P: a mirrored QBO
 * Bill (mdata.qbo_ap_bills) is projected into accounting.bills (source_system='qbo') by
 * projectApBillsToLedger() and consequently SHOWS UP in views.ap_aging — the exact source FIN-20
 * reads — at the right amount, vendor, and entity, WITHOUT double-counting TMS-native bills and
 * WITHOUT ever posting to the GL.
 *
 * Guards, in order:
 *   1. Flag OFF (QBO_AP_BILLS_PROJECTION_ENABLED unset) -> projection no-ops; the mirrored bill is
 *      NOT in accounting.bills and the A/P aging is unchanged.
 *   2. Flag ON -> the mirrored bill lands in accounting.bills (source_system='qbo') and views.ap_aging
 *      returns it at the correct open cents under the LOCAL vendor it matched (via qbo_vendor_id).
 *   3. Vendor with no local match is RECORDED (vendor_uuid NULL, vendor_id = the QBO vendor id) and
 *      SURFACED in the aging under that key — never silently dropped.
 *   4. Idempotent: re-running projection does NOT create a duplicate accounting.bills row and does not
 *      change the aging total (keyed by uq_bills_company_qbo_bill_id).
 *   5. A TMS-native bill (source_system='tms') is never touched or double-counted.
 *
 * The projection runs on its OWN pooled connection (withLuciaBypass) and COMMITs, so fixtures are
 * committed and then explicitly cleaned up in afterAll (superuser DELETE) — this test cannot use the
 * single-transaction rollback pattern. Money is integer cents. NO GL/journal assertions exist because
 * the projection performs NO posting.
 *
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
// Top-level import: evaluated with QBO_AP_BILLS_PROJECTION_ENABLED unset -> the OFF variant.
import { projectApBillsToLedger as projectWhenFlagOff } from "../ap-bills-puller.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("QBO-AP-PULL Stage 2 projection -> A/P aging (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;

  // Unique per run so parallel/leftover state can't collide; assertions filter on these exact keys.
  const tag = randomUUID().slice(0, 8);
  const vendorMatchedUuid = randomUUID();
  const vendorNativeUuid = randomUUID();
  const qboVendorMatchedId = `QBOVEND-M-${tag}`;
  const qboVendorUnmatchedId = `QBOVEND-U-${tag}`;
  const qboBillMatchedId = `QBOBILL-M-${tag}`;
  const qboBillUnmatchedId = `QBOBILL-U-${tag}`;
  const nativeBillId = randomUUID();

  // Hand-checked cents.
  const MATCHED_CENTS = 5_000_000; // $50,000.00 open, matched to a local vendor
  const UNMATCHED_CENTS = 250_000; // $2,500.00 open, no local vendor
  const NATIVE_CENTS = 1_111; //     $11.11 open, TMS-native (must not be touched/doubled)

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    // Superuser connection (no SET ROLE): bypasses RLS for committed fixtures, reads, and cleanup.
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();

    // Fixtures must be COMMITTED — projectApBillsToLedger reads/writes on its own pooled connection.
    await db.query("BEGIN");

    // Local vendor the matched QBO bill resolves to via qbo_vendor_id.
    await db.query(
      `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type, qbo_vendor_id)
       VALUES ($1::uuid,$2::uuid,$3,'Other',$4)`,
      [vendorMatchedUuid, companyId, `AP-PROJ Matched Vendor ${tag}`, qboVendorMatchedId]
    );
    // Local vendor for the TMS-native bill (a different vendor so its total is isolated).
    await db.query(
      `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type)
       VALUES ($1::uuid,$2::uuid,$3,'Other')`,
      [vendorNativeUuid, companyId, `AP-PROJ Native Vendor ${tag}`]
    );

    // TMS-native open bill (source_system default 'tms', qbo_bill_id NULL) — must never be doubled.
    await db.query(
      `INSERT INTO accounting.bills
         (id, operating_company_id, vendor_id, vendor_uuid, bill_number, bill_date, due_date, amount_cents, paid_cents, status)
       VALUES ($1::uuid,$2::uuid,$3,$3,$4, CURRENT_DATE - 10, CURRENT_DATE - 5, $5, 0, 'unpaid')`,
      [nativeBillId, companyId, vendorNativeUuid, `NATIVE-${tag}`, NATIVE_CENTS]
    );

    // Two inbound QBO mirror rows: one matches a local vendor, one has no local vendor.
    await db.query(
      `INSERT INTO mdata.qbo_ap_bills
         (operating_company_id, qbo_id, doc_number, vendor_qbo_id, vendor_name, txn_date, due_date, total_cents, balance_cents, active)
       VALUES ($1::uuid,$2,$3,$4,$5, CURRENT_DATE - 20, CURRENT_DATE - 15, $6, $6, true)`,
      [companyId, qboBillMatchedId, `QB-M-${tag}`, qboVendorMatchedId, `AP-PROJ Matched Vendor ${tag}`, MATCHED_CENTS]
    );
    await db.query(
      `INSERT INTO mdata.qbo_ap_bills
         (operating_company_id, qbo_id, doc_number, vendor_qbo_id, vendor_name, txn_date, due_date, total_cents, balance_cents, active)
       VALUES ($1::uuid,$2,$3,$4,$5, CURRENT_DATE - 20, CURRENT_DATE - 15, $6, $6, true)`,
      [companyId, qboBillUnmatchedId, `QB-U-${tag}`, qboVendorUnmatchedId, `QBO Only Vendor ${tag}`, UNMATCHED_CENTS]
    );

    await db.query("COMMIT");
  });

  afterAll(async () => {
    if (db) {
      // Superuser cleanup (RLS bypassed): remove only this run's committed fixtures + projected rows.
      await db
        .query(`DELETE FROM accounting.bills WHERE operating_company_id = $1::uuid AND (id = $2::uuid OR qbo_bill_id = ANY($3::text[]))`, [
          companyId,
          nativeBillId,
          [qboBillMatchedId, qboBillUnmatchedId],
        ])
        .catch(() => {});
      await db
        .query(`DELETE FROM mdata.qbo_ap_bills WHERE operating_company_id = $1::uuid AND qbo_id = ANY($2::text[])`, [
          companyId,
          [qboBillMatchedId, qboBillUnmatchedId],
        ])
        .catch(() => {});
      await db
        .query(`DELETE FROM mdata.vendors WHERE id = ANY($1::uuid[])`, [[vendorMatchedUuid, vendorNativeUuid]])
        .catch(() => {});
      await db.end().catch(() => {});
    }
    vi.unstubAllEnvs();
  });

  async function billRowCount(qboBillId: string): Promise<number> {
    const r = await db.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM accounting.bills WHERE operating_company_id = $1::uuid AND qbo_bill_id = $2`,
      [companyId, qboBillId]
    );
    return Number(r.rows[0]!.n);
  }

  // views.ap_aging groups by COALESCE(NULLIF(trim(vendor_uuid),''), vendor_id, 'unknown') AS vendor_id.
  async function agingOpenCents(vendorKey: string): Promise<number | null> {
    const r = await db.query<{ total_open_cents: string; vendor_name: string }>(
      `SELECT total_open_cents, vendor_name FROM views.ap_aging WHERE operating_company_id = $1::uuid AND vendor_id = $2::text`,
      [companyId, vendorKey]
    );
    return r.rows[0] ? Number(r.rows[0].total_open_cents) : null;
  }

  it("flag OFF: projection no-ops — the mirrored QBO bill is NOT in accounting.bills or the A/P aging", async () => {
    const res = await projectWhenFlagOff(companyId);
    expect(res.enabled).toBe(false);
    expect(res.rowsProjected).toBe(0);

    expect(await billRowCount(qboBillMatchedId)).toBe(0);
    expect(await billRowCount(qboBillUnmatchedId)).toBe(0);
    // Matched QBO vendor has no local id key yet; its aging row must be absent while OFF.
    expect(await agingOpenCents(vendorMatchedUuid)).toBeNull();
    // The TMS-native bill is already visible on its own (unaffected by the flag).
    expect(await agingOpenCents(vendorNativeUuid)).toBe(NATIVE_CENTS);
  });

  it("flag ON: mirrored QBO bill is projected and appears in views.ap_aging at the right amount/vendor/entity", async () => {
    vi.stubEnv("QBO_AP_BILLS_PROJECTION_ENABLED", "true");
    vi.resetModules();
    const mod = await import("../ap-bills-puller.js");
    const res = await mod.projectApBillsToLedger(companyId);
    expect(res.enabled).toBe(true);
    expect(res.rowsProjected).toBeGreaterThanOrEqual(2);

    // Exactly one accounting.bills row per QBO bill, source_system='qbo', matched vendor linked.
    expect(await billRowCount(qboBillMatchedId)).toBe(1);
    const matched = await db.query<{ source_system: string; vendor_uuid: string; amount_cents: string; status: string }>(
      `SELECT source_system, vendor_uuid, amount_cents, status FROM accounting.bills WHERE operating_company_id=$1::uuid AND qbo_bill_id=$2`,
      [companyId, qboBillMatchedId]
    );
    expect(matched.rows[0]!.source_system).toBe("qbo");
    expect(matched.rows[0]!.vendor_uuid).toBe(vendorMatchedUuid);
    expect(Number(matched.rows[0]!.amount_cents)).toBe(MATCHED_CENTS);
    expect(matched.rows[0]!.status).toBe("unpaid");

    // The A/P aging (what FIN-20 reads) now returns the QBO bill under its matched LOCAL vendor.
    expect(await agingOpenCents(vendorMatchedUuid)).toBe(MATCHED_CENTS);
  });

  it("flag ON: a QBO vendor with no local match is recorded + surfaced (not silently dropped)", async () => {
    // Projection already ran in the previous test (flag ON module cached). Verify the unmatched row.
    expect(await billRowCount(qboBillUnmatchedId)).toBe(1);
    const unmatched = await db.query<{ vendor_uuid: string | null; vendor_id: string }>(
      `SELECT vendor_uuid, vendor_id FROM accounting.bills WHERE operating_company_id=$1::uuid AND qbo_bill_id=$2`,
      [companyId, qboBillUnmatchedId]
    );
    expect(unmatched.rows[0]!.vendor_uuid).toBeNull();
    expect(unmatched.rows[0]!.vendor_id).toBe(qboVendorUnmatchedId);
    // Surfaced in aging under the QBO vendor id key at the right amount.
    expect(await agingOpenCents(qboVendorUnmatchedId)).toBe(UNMATCHED_CENTS);
  });

  it("flag ON: idempotent re-run creates no duplicate and does not change the aging; native bill not doubled", async () => {
    const mod = await import("../ap-bills-puller.js");
    await mod.projectApBillsToLedger(companyId);
    await mod.projectApBillsToLedger(companyId);

    expect(await billRowCount(qboBillMatchedId)).toBe(1);
    expect(await billRowCount(qboBillUnmatchedId)).toBe(1);
    expect(await agingOpenCents(vendorMatchedUuid)).toBe(MATCHED_CENTS);
    expect(await agingOpenCents(qboVendorUnmatchedId)).toBe(UNMATCHED_CENTS);
    // TMS-native bill untouched — exactly its own amount, never doubled by the QBO projection.
    expect(await agingOpenCents(vendorNativeUuid)).toBe(NATIVE_CENTS);
    const native = await db.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM accounting.bills WHERE operating_company_id=$1::uuid AND id=$2::uuid AND source_system='tms'`,
      [companyId, nativeBillId]
    );
    expect(Number(native.rows[0]!.n)).toBe(1);
  });
});
