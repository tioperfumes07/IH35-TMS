/**
 * ROUND 152.1 — mint driver settlements (and, on close, company settlements) from fed data.
 *
 * Why this exists: `feed-settlement-day.mts` books loads / invoices / driver bills from AlwaysTrack
 * control, but never opened `driver_finance.driver_settlements`. Live auto-mint only fires via
 * `pingSettlementOnLoadEvent` on live status transitions — historical feed skips that path.
 * Company settlements mint only when a driver settlement closes
 * (`closeCompanySettlementAlongsideDriverSettlement` inside `closeSettlementPayRun`).
 *
 * This helper is the missing link: group live non-voided driver bills by AlwaysTrack document
 * number (parsed from the historical-backfill notes), mint one driver settlement per document,
 * link bills, append earnings lines, apply pending deductions, recompute header. Pure-Aug docs
 * close via `postLoadBookendedSettlementGlAfterClose` (GL + company settlement). Aug–Sep span
 * docs stay open.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { appendSettlementLineFromDriverBillIfMissing, appendEscrowContributionLineIfMissing } from "../driver-finance/settlement-engine.js";
import { applyPendingDeductionsToSettlementWithNetFloor } from "../driver-finance/settlement-deduction-cap.service.js";
import { applyAutoDeductionsToSettlement } from "../settlements/auto-deductions/apply.js";
import { materializeSettlementLines } from "../driver-finance/settlement-lines-materialize.service.js";
import { aggregateSettlementTotals, SETTLEMENT_DEDUCTION_APPLY_FLAG } from "../driver-finance/settlements-load-bookended.service.js";
import { postLoadBookendedSettlementGlAfterClose } from "../driver-finance/settlement-payrun-close.service.js";
import { isEnabled } from "../lib/feature-flags/service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export type FedSettlementDocInput = {
  documentNumber: string;
  driverId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  loadNumbers: string[];
  /** Close + GL + company settlement. False = leave open (Aug–Sep span). */
  close: boolean;
};

export type EnsureSettlementFromFedBillsResult = {
  documentNumber: string;
  settlementId: string;
  alreadyExisted: boolean;
  status: string;
  billsLinked: number;
  linesAppendedForLoads: string[];
  closed: boolean;
  settlementPosted: boolean;
  journalEntryId: string | null;
  warnings: string[];
  closeRequested: boolean;
};

function parseDocFromBillNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/Historical backfill from settlement\s+(\d+)/i);
  return m?.[1] ?? null;
}

/**
 * Find live USMCA driver bills whose historical-backfill notes cite `documentNumber`.
 */
export async function findBillsForSettlementDocument(
  client: DbClient,
  operatingCompanyId: string,
  documentNumber: string
): Promise<Array<{ id: string; load_id: string; load_number: string; driver_id: string; gross_amount_cents: number }>> {
  const res = await client.query<{
    id: string;
    load_id: string;
    load_number: string;
    driver_id: string;
    gross_amount_cents: number;
    notes: string | null;
  }>(
    `SELECT id::text, load_id::text, load_number, driver_id::text, gross_amount_cents, notes
       FROM driver_finance.driver_bills
      WHERE operating_company_id = $1::uuid
        AND voided_at IS NULL
        AND status <> 'void'
        AND notes ILIKE $2`,
    [operatingCompanyId, `%Historical backfill from settlement ${documentNumber}%`]
  );
  return res.rows
    .filter((r) => parseDocFromBillNotes(r.notes) === documentNumber)
    .map((r) => ({
      id: r.id,
      load_id: r.load_id,
      load_number: r.load_number,
      driver_id: r.driver_id,
      gross_amount_cents: Number(r.gross_amount_cents),
    }));
}

async function findLiveSettlementByDocumentRef(
  client: DbClient,
  operatingCompanyId: string,
  documentNumber: string
): Promise<{ id: string; status: string } | null> {
  const res = await client.query<{ id: string; status: string }>(
    `SELECT id::text, status
       FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid
        AND source_document_ref = $2
        AND voided_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1`,
    [operatingCompanyId, documentNumber]
  );
  return res.rows[0] ?? null;
}

/**
 * Mint (or reuse) the driver settlement for one AlwaysTrack document from already-fed bills.
 * When `close` is true, posts GL via the canonical close path (which also mints the company settlement).
 */
export async function ensureSettlementFromFedBills(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    actorUserId: string;
    doc: FedSettlementDocInput;
  }
): Promise<EnsureSettlementFromFedBillsResult> {
  const { operatingCompanyId, actorUserId, doc } = input;
  const warnings: string[] = [];
  const linesAppendedForLoads: string[] = [];

  const bills = await findBillsForSettlementDocument(client, operatingCompanyId, doc.documentNumber);
  if (bills.length === 0) {
    warnings.push(`no live driver bills for settlement ${doc.documentNumber} — mint skipped (zero-pay loads produce invoices only)`);
    // Still allow an empty open shell only when close=false and caller expects a placeholder — refuse.
    throw Object.assign(new Error(`no_bills_for_settlement_${doc.documentNumber}`), {
      code: "no_bills_for_settlement",
      documentNumber: doc.documentNumber,
    });
  }

  const driverIds = [...new Set(bills.map((b) => b.driver_id))];
  // Prefer the control USMCA driver. Bills may sit on a TRANSP twin (Alfonso dcd683f5) or a
  // same-OCI duplicate name (Angel fba21d80 vs 52037e93) — settlement earnings lines look up by
  // (load_id, settlement.driver_id), so mismatched bill.driver_id silently drops a load's pay.
  for (const bill of bills) {
    if (bill.driver_id !== doc.driverId) {
      await client.query(
        `UPDATE driver_finance.driver_bills
            SET driver_id = $1::uuid, updated_at = now()
          WHERE id = $2::uuid AND voided_at IS NULL`,
        [doc.driverId, bill.id]
      );
      warnings.push(
        `re-homed bill ${bill.load_number} driver ${bill.driver_id} → control ${doc.driverId}`
      );
      bill.driver_id = doc.driverId;
    }
  }
  const driverId = doc.driverId;

  let alreadyExisted = false;
  let settlementId: string;
  let status: string;

  const existing = await findLiveSettlementByDocumentRef(client, operatingCompanyId, doc.documentNumber);
  if (existing) {
    alreadyExisted = true;
    settlementId = existing.id;
    status = existing.status;
    // Empty approved shells (Sep pre-mint with $0 / 0 lines) must reopen so materialize +
    // earnings append can run (materializeSettlementLines freezes non-open settlements).
    if (status !== "open") {
      const lineCount = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM driver_finance.settlement_lines
          WHERE settlement_id = $1::uuid AND is_active = true
            AND line_type IN ('earnings','deadhead_pay')`,
        [settlementId]
      );
      if (Number(lineCount.rows[0]?.n ?? 0) === 0) {
        await client.query(
          `UPDATE driver_finance.driver_settlements
              SET status = 'open', trip_closed_at = NULL, updated_at = now()
            WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
          [settlementId, operatingCompanyId]
        );
        status = "open";
        warnings.push(`reopened empty shell ${doc.documentNumber} (status was ${existing.status}, 0 earnings lines)`);
      }
    }
  } else {
    // AlwaysTrack number is the business identity (Rule 03). display_id carries the same digits
    // (live bookend allocator also emits bare digits). Always mint as 'open' first so
    // materializeSettlementLines can run; flip to approved immediately before close.
    const firstLoad = bills[0]!;
    const lastLoad = bills[bills.length - 1]!;
    const sampleRes = await client.query<{ is_sample_data: boolean }>(
      `SELECT COALESCE(is_sample_data, false) AS is_sample_data
         FROM mdata.loads WHERE id = $1::uuid`,
      [firstLoad.load_id]
    );
    const isSampleData = Boolean(sampleRes.rows[0]?.is_sample_data);
    const inserted = await client.query<{ id: string; status: string }>(
      `INSERT INTO driver_finance.driver_settlements (
         operating_company_id, display_id, driver_id, period_start, period_end, status,
         gross_pay, deductions_total, reimbursements_total, net_pay,
         settlement_model, source_document_ref, created_by_user_id, is_sample_data,
         first_load_id, first_load_number, last_load_id, last_load_number
       ) VALUES (
         $1::uuid, $2, $3::uuid, $4::date, $5::date, 'open',
         0, 0, 0, 0,
         'load_bookended', $2, $6::uuid, $11,
         $7::uuid, $8, $9::uuid, $10
       )
       RETURNING id::text, status`,
      [
        operatingCompanyId,
        doc.documentNumber,
        driverId,
        doc.periodStart,
        doc.periodEnd,
        actorUserId,
        firstLoad.load_id,
        firstLoad.load_number,
        lastLoad.load_id,
        lastLoad.load_number,
        isSampleData,
      ]
    );
    settlementId = inserted.rows[0]!.id;
    status = inserted.rows[0]!.status;

    await appendCrudAudit(
      client as never,
      actorUserId,
      "driver_finance.settlement.fed_document_mint",
      {
        operating_company_id: operatingCompanyId,
        document_number: doc.documentNumber,
        settlement_id: settlementId,
        bill_count: bills.length,
        close: doc.close,
      },
      "info",
      "FEED-ENSURE-SETTLEMENT-01"
    );
  }

  // Link bills → settlement (idempotent).
  let billsLinked = 0;
  for (const bill of bills) {
    const upd = await client.query(
      `UPDATE driver_finance.driver_bills
          SET settled_in_settlement_id = $1::uuid, updated_at = now()
        WHERE id = $2::uuid
          AND (settled_in_settlement_id IS NULL OR settled_in_settlement_id = $1::uuid)`,
      [settlementId, bill.id]
    );
    billsLinked += upd.rowCount ?? 0;
  }

  // Earnings + escrow contribution lines per load.
  for (const bill of bills) {
    await appendSettlementLineFromDriverBillIfMissing(client, {
      settlementId,
      operatingCompanyId,
      driverId,
      loadId: bill.load_id,
      actorUserId,
    });
    await appendEscrowContributionLineIfMissing(client, {
      settlementId,
      operatingCompanyId,
      driverId,
      loadId: bill.load_id,
      actorUserId,
    });
    linesAppendedForLoads.push(bill.load_number);
  }

  // Pending admin / CA deductions (flag-gated, same as live tour close).
  const deductionApplyEnabled = await isEnabled(client as never, SETTLEMENT_DEDUCTION_APPLY_FLAG, {
    operating_company_id: operatingCompanyId,
  });
  if (deductionApplyEnabled) {
    await applyAutoDeductionsToSettlement(client, {
      settlementId,
      driverId,
      operatingCompanyId,
      actorUserId,
    });
    await applyPendingDeductionsToSettlementWithNetFloor(client, {
      settlementId,
      driverId,
      operatingCompanyId,
      actorUserId,
    });
  } else {
    warnings.push(`${SETTLEMENT_DEDUCTION_APPLY_FLAG} OFF — pending deductions not applied`);
  }

  await materializeSettlementLines(client, {
    settlementId,
    operatingCompanyId,
    actorUserId,
  });
  await aggregateSettlementTotals(client, settlementId, operatingCompanyId);

  // Do NOT call postLoadBookendedSettlementGlAfterClose here — it opens its own connection and
  // cannot see an uncommitted mint (same TWO-PHASE rule as seedSettlementDocument /
  // postGlForSeededDocument). Caller commits, then invokes closeFedSettlementIfRequested.

  return {
    documentNumber: doc.documentNumber,
    settlementId,
    alreadyExisted,
    status,
    billsLinked,
    linesAppendedForLoads,
    closed: false,
    settlementPosted: false,
    journalEntryId: null,
    warnings,
    closeRequested: doc.close,
  };
}

/**
 * PHASE 2 — after the mint transaction has committed. Flips to approved and posts GL
 * (which also mints the company settlement via closeCompanySettlementAlongsideDriverSettlement).
 */
export async function closeFedSettlementIfRequested(input: {
  operatingCompanyId: string;
  actorUserId: string;
  settlementId: string;
  documentNumber: string;
  close: boolean;
}): Promise<{ closed: boolean; settlementPosted: boolean; journalEntryId: string | null; status: string; warnings: string[] }> {
  const warnings: string[] = [];
  if (!input.close) {
    return { closed: false, settlementPosted: false, journalEntryId: null, status: "open", warnings };
  }

  await withCurrentUser(input.actorUserId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);
    await client.query(
      `UPDATE driver_finance.driver_settlements
          SET status = 'approved',
              trip_closed_at = COALESCE(trip_closed_at, now()),
              updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND status IN ('open', 'approved')`,
      [input.settlementId, input.operatingCompanyId]
    );
  });

  const posted = await postLoadBookendedSettlementGlAfterClose({
    operatingCompanyId: input.operatingCompanyId,
    settlementId: input.settlementId,
    actorUserId: input.actorUserId,
  });
  if (!posted.posted && posted.error) warnings.push(posted.error);

  let status = "approved";
  await withCurrentUser(input.actorUserId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);
    const after = await client.query<{ status: string }>(
      `SELECT status FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
      [input.settlementId]
    );
    status = after.rows[0]?.status ?? status;
  });

  return {
    closed: true,
    settlementPosted: posted.posted,
    journalEntryId: posted.journal_entry_id,
    status,
    warnings,
  };
}
