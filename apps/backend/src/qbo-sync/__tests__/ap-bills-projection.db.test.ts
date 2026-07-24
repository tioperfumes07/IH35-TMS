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
  const coaAccountId = randomUUID();
  const qboAccountId = `QBOACCT-${tag}`;

  // Hand-checked cents.
  const MATCHED_CENTS = 5_000_000; // $50,000.00 open, matched to a local vendor
  const UNMATCHED_CENTS = 250_000; // $2,500.00 open, no local vendor
  const NATIVE_CENTS = 1_111; //     $11.11 open, TMS-native (must not be touched/doubled)
  const LINE1_DOLLARS = 30000; // $30,000
  const LINE2_DOLLARS = 20000; // $20,000 — sum matches MATCHED_CENTS

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

    // Local CoA account the AccountBased line maps to via qbo_account_id.
    await db.query(
      `INSERT INTO catalogs.accounts
         (id, operating_company_id, account_number, account_name, account_type, qbo_account_id, is_postable)
       VALUES ($1::uuid,$2::uuid,$3,$4,'Expense',$5,true)`,
      [coaAccountId, companyId, `6${tag.slice(0, 4)}`, `AP-PROJ Expense ${tag}`, qboAccountId]
    );

    // TMS-native open bill (source_system default 'tms', qbo_bill_id NULL) — must never be doubled.
    await db.query(
      `INSERT INTO accounting.bills
         (id, operating_company_id, vendor_id, vendor_uuid, bill_number, bill_date, due_date, amount_cents, paid_cents, status)
       VALUES ($1::uuid,$2::uuid,$3,$3,$4, CURRENT_DATE - 10, CURRENT_DATE - 5, $5, 0, 'unpaid')`,
      [nativeBillId, companyId, vendorNativeUuid, `NATIVE-${tag}`, NATIVE_CENTS]
    );
    // Plant a TMS-native line so Stage 2b cannot silently wipe non-QBO lines (coverage for DELETE scope).
    await db.query(
      `INSERT INTO accounting.bill_lines (bill_id, line_sequence, amount, description, section)
       VALUES ($1::uuid, 1, $2::numeric, 'TMS native line must survive QBO reproject', 'A')`,
      [nativeBillId, NATIVE_CENTS / 100]
    );

    const matchedPayload = {
      Id: qboBillMatchedId,
      TotalAmt: MATCHED_CENTS / 100,
      Line: [
        {
          Id: "1",
          LineNum: 1,
          Amount: LINE1_DOLLARS,
          DetailType: "AccountBasedExpenseLineDetail",
          Description: "Line A",
          AccountBasedExpenseLineDetail: { AccountRef: { value: qboAccountId, name: "Expense" } },
        },
        {
          Id: "2",
          LineNum: 2,
          Amount: LINE2_DOLLARS,
          DetailType: "AccountBasedExpenseLineDetail",
          Description: "Line B",
          AccountBasedExpenseLineDetail: { AccountRef: { value: qboAccountId, name: "Expense" } },
        },
        {
          Id: "3",
          DetailType: "DescriptionOnly",
          Description: "Should be skipped",
        },
      ],
    };

    // Two inbound QBO mirror rows: one matches a local vendor, one has no local vendor.
    await db.query(
      `INSERT INTO mdata.qbo_ap_bills
         (operating_company_id, qbo_id, doc_number, vendor_qbo_id, vendor_name, txn_date, due_date, total_cents, balance_cents, active, payload_json)
       VALUES ($1::uuid,$2,$3,$4,$5, CURRENT_DATE - 20, CURRENT_DATE - 15, $6, $6, true, $7::jsonb)`,
      [
        companyId,
        qboBillMatchedId,
        `QB-M-${tag}`,
        qboVendorMatchedId,
        `AP-PROJ Matched Vendor ${tag}`,
        MATCHED_CENTS,
        JSON.stringify(matchedPayload),
      ]
    );
    await db.query(
      `INSERT INTO mdata.qbo_ap_bills
         (operating_company_id, qbo_id, doc_number, vendor_qbo_id, vendor_name, txn_date, due_date, total_cents, balance_cents, active, payload_json)
       VALUES ($1::uuid,$2,$3,$4,$5, CURRENT_DATE - 20, CURRENT_DATE - 15, $6, $6, true, $7::jsonb)`,
      [
        companyId,
        qboBillUnmatchedId,
        `QB-U-${tag}`,
        qboVendorUnmatchedId,
        `QBO Only Vendor ${tag}`,
        UNMATCHED_CENTS,
        JSON.stringify({
          Id: qboBillUnmatchedId,
          TotalAmt: UNMATCHED_CENTS / 100,
          Line: [
            {
              Id: "1",
              LineNum: 1,
              Amount: UNMATCHED_CENTS / 100,
              DetailType: "ItemBasedExpenseLineDetail",
              Description: "Item line unmapped",
              ItemBasedExpenseLineDetail: { ItemRef: { value: `ITEM-${tag}`, name: "Unknown" } },
            },
          ],
        }),
      ]
    );

    await db.query("COMMIT");
  });

  afterAll(async () => {
    if (db) {
      // Superuser cleanup (RLS bypassed): remove only this run's committed fixtures + projected rows.
      await db
        .query(
          `DELETE FROM accounting.bill_lines WHERE bill_id IN (
             SELECT id FROM accounting.bills
             WHERE operating_company_id = $1::uuid AND (id = $2::uuid OR qbo_bill_id = ANY($3::text[]))
           )`,
          [companyId, nativeBillId, [qboBillMatchedId, qboBillUnmatchedId]]
        )
        .catch(() => {});
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
        .query(`DELETE FROM catalogs.accounts WHERE id = $1::uuid`, [coaAccountId])
        .catch(() => {});
      await db
        .query(`DELETE FROM mdata.vendors WHERE id = ANY($1::uuid[])`, [[vendorMatchedUuid, vendorNativeUuid]])
        .catch(() => {});
      // Restore the flag default so this file's ON-enable can't leak into other db.tests sharing the CI DB.
      await db
        .query(`UPDATE lib.feature_flags SET default_enabled = false WHERE flag_key = 'QBO_AP_BILLS_PROJECTION_ENABLED'`)
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
    // The puller now resolves the flag from the DB (isEnabled), NOT process.env — enable it in the test
    // DB. (resolveFlagEnabled honors default_enabled for this non-per-entity-gated flag.)
    await db.query(
      `UPDATE lib.feature_flags SET default_enabled = true WHERE flag_key = 'QBO_AP_BILLS_PROJECTION_ENABLED'`
    );
    const mod = await import("../ap-bills-puller.js");
    const res = await mod.projectApBillsToLedger(companyId);
    expect(res.enabled).toBe(true);
    expect(res.rowsProjected).toBeGreaterThanOrEqual(2);
    expect(res.lines.enabled).toBe(true);
    expect(res.lines.linesProjected).toBeGreaterThanOrEqual(3); // 2 AccountBased + 1 ItemBased

    // Exactly one accounting.bills row per QBO bill, source_system='qbo', matched vendor linked.
    expect(await billRowCount(qboBillMatchedId)).toBe(1);
    const matched = await db.query<{ source_system: string; vendor_uuid: string; amount_cents: string; status: string; id: string }>(
      `SELECT id::text, source_system, vendor_uuid, amount_cents, status FROM accounting.bills WHERE operating_company_id=$1::uuid AND qbo_bill_id=$2`,
      [companyId, qboBillMatchedId]
    );
    expect(matched.rows[0]!.source_system).toBe("qbo");
    expect(matched.rows[0]!.vendor_uuid).toBe(vendorMatchedUuid);
    expect(Number(matched.rows[0]!.amount_cents)).toBe(MATCHED_CENTS);
    expect(matched.rows[0]!.status).toBe("unpaid");

    // Stage 2b: AccountBased lines projected with mapped account_id; DescriptionOnly skipped.
    const lines = await db.query<{ n: string; with_acct: string }>(
      `SELECT count(*)::int AS n,
              count(*) FILTER (WHERE account_id = $2::uuid)::int AS with_acct
       FROM accounting.bill_lines WHERE bill_id = $1::uuid`,
      [matched.rows[0]!.id, coaAccountId]
    );
    expect(Number(lines.rows[0]!.n)).toBe(2);
    expect(Number(lines.rows[0]!.with_acct)).toBe(2);

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
    const mid = await db.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM accounting.bill_lines bl
       JOIN accounting.bills b ON b.id = bl.bill_id
       WHERE b.operating_company_id=$1::uuid AND b.qbo_bill_id=$2`,
      [companyId, qboBillMatchedId]
    );
    await mod.projectApBillsToLedger(companyId);
    const after = await db.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM accounting.bill_lines bl
       JOIN accounting.bills b ON b.id = bl.bill_id
       WHERE b.operating_company_id=$1::uuid AND b.qbo_bill_id=$2`,
      [companyId, qboBillMatchedId]
    );
    expect(Number(after.rows[0]!.n)).toBe(Number(mid.rows[0]!.n));
    expect(Number(after.rows[0]!.n)).toBe(2);

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
    const nativeLines = await db.query<{ n: string; desc: string }>(
      `SELECT count(*)::int AS n, max(description) AS desc FROM accounting.bill_lines WHERE bill_id=$1::uuid`,
      [nativeBillId]
    );
    expect(Number(nativeLines.rows[0]!.n)).toBe(1);
    expect(nativeLines.rows[0]!.desc).toContain("TMS native line must survive");
  });
});
