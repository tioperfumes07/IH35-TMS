/**
 * LEAD 443.110 G4 — the Settlement Creator's "owed" company expense (paid by nobody yet: the company owes the vendor)
 * is a vendor BILL in Accounts Payable, and it is a full document:
 *
 *  - numbered on its LOAD's spine (expense-number.ts: load, load-1, load-2 ...) — never the bare load number, which is
 *    the driver bill's number for that load (owner ruling 2026-10-02: driver bills are numbered as their loads), and
 *    never a number another bill already holds;
 *  - GL-POSTED in the Creator's own transaction through the canonical poster (Dr the item's account / Cr A/P with the
 *    vendor) — a bill the ledger refuses fails the whole post, never a bill without its journal entry;
 *  - carries vendor, load, driver, unit (the load's same-entity unit when the draft has none) and trailer (the load's,
 *    via the one trailer rule, when the draft has none);
 *  - its id is returned so the Creator keeps it in the posted audit (owed_bill_ids) and Edit (void and repost) voids it
 *    through the bill void engine — a reversal, never a delete.
 */
import { createBillInClientTx, postBillDocumentInClientTx } from "../accounting/bills.service.js";
import { voidDocument } from "../accounting/void-document.service.js";
import { sameEntityLoadUnitSql } from "../accounting/load-unit.sql.js";
import { stampNewDriverBillTrailerFromLoad } from "../accounting/bill-trailer-stamp.service.js";
import { generateExpenseNumber } from "../expense-attribution/expense-number.js";
import { SettlementCreatorError } from "./settlement-creator-error.js";

type Queryable = { query: <R = any>(sql: string, params?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }> };

export type CreatorOwedBillInput = {
  operatingCompanyId: string;
  actorUserId: string;
  vendorId: string;
  vendorDocumentNumber?: string | null;
  loadId: string;
  driverId: string;
  unitId?: string | null;
  trailerId?: string | null;
  billDate: string;
  amountCents: number;
  memo: string;
  itemId: string;
  accountId: string;
  quantity: number;
  rateCents: number;
  unitOfMeasure: string;
  description?: string | null;
  /** Label for refusal messages (the item name). */
  label: string;
};

export type CreatorOwedBill = { billId: string; billNumber: string; journalEntryId: string };

/** The next spine number for this load that is neither the bare load number (the driver bill's) nor any bill's number. */
export async function nextOwedBillSpineNumber(client: Queryable, operatingCompanyId: string, loadId: string): Promise<string> {
  for (let i = 0; i < 50; i += 1) {
    const n = await generateExpenseNumber(client as never, loadId, operatingCompanyId);
    if (n.number === n.loadNumber) continue;
    const taken = await client.query(
      `SELECT 1 FROM accounting.bills WHERE operating_company_id = $1::uuid AND (display_id = $2 OR bill_number = $2) LIMIT 1`,
      [operatingCompanyId, n.number],
    );
    if (!taken.rows.length) return n.number;
  }
  throw new SettlementCreatorError("owed_bill_number_exhausted", "Could not find a free load-spine number for the owed bill.");
}

export async function writeCreatorOwedBill(client: Queryable, input: CreatorOwedBillInput): Promise<CreatorOwedBill> {
  const opco = input.operatingCompanyId;
  const billNumber = await nextOwedBillSpineNumber(client, opco, input.loadId);
  const unitId =
    input.unitId ??
    (await client.query<{ unit_id: string | null }>(`SELECT ${sameEntityLoadUnitSql("$1::uuid", "$2::uuid")}::text AS unit_id`, [input.loadId, opco]))
      .rows[0]?.unit_id ??
    null;
  const bill = await createBillInClientTx(
    client as never,
    {
      operatingCompanyId: opco,
      source: "settlement_creator_owed",
      vendorId: input.vendorId,
      // The vendor's invoice number stays the bill_number (per-vendor duplicate refusal); the spine number is the
      // bill's own document number. No vendor number -> the spine number is both.
      vendorDocumentNumber: input.vendorDocumentNumber?.trim() || undefined,
      billNumber: input.vendorDocumentNumber?.trim() || billNumber,
      displayId: billNumber,
      loadId: input.loadId,
      driverId: input.driverId,
      unitId,
      trailerId: input.trailerId ?? null,
      billDate: input.billDate,
      amountCents: input.amountCents,
      memo: input.memo,
      lines: [
        {
          amountCents: input.amountCents,
          itemId: input.itemId,
          quantity: input.quantity,
          rateCents: input.rateCents,
          unitOfMeasure: input.unitOfMeasure,
          loadId: input.loadId,
          description: input.description ?? input.label,
          accountId: input.accountId,
        },
      ],
    } as never,
    input.actorUserId,
  );
  const billId = String((bill as { id: string }).id);
  // The load's trailer (company or customer) when the draft named none — only where still empty.
  await stampNewDriverBillTrailerFromLoad(client as never, { operatingCompanyId: opco, billId, loadId: input.loadId });
  let journalEntryId: string | null = null;
  try {
    const posted = await postBillDocumentInClientTx(
      client as never,
      { operating_company_id: opco, bill_id: billId, posting_purpose: "initial_post" } as never,
      { userId: input.actorUserId } as never,
    );
    journalEntryId = (posted as { journal_entry_id?: string | null })?.journal_entry_id ?? null;
  } catch (err) {
    throw new SettlementCreatorError(
      "owed_bill_post_refused",
      `Company expense "${input.label}" (owed to the vendor): the ledger refused its bill — ${err instanceof Error ? err.message : String(err)}. Nothing was posted.`,
    );
  }
  if (!journalEntryId) {
    throw new SettlementCreatorError(
      "owed_bill_post_refused",
      `Company expense "${input.label}" (owed to the vendor): its bill posted no journal entry. Nothing was posted.`,
    );
  }
  return { billId, billNumber, journalEntryId };
}

/** Edit = void and repost: the prior post's owed bills are voided through the bill void engine (reversal JE). */
export async function voidCreatorOwedBills(
  client: Queryable,
  input: { operatingCompanyId: string; billIds: string[]; reason: string; actorUserId: string; currentBusinessDate: string },
): Promise<void> {
  for (const billId of input.billIds) {
    try {
      await voidDocument(client as never, {
        operatingCompanyId: input.operatingCompanyId,
        type: "bill",
        id: billId,
        reason: input.reason,
        actor: { userId: input.actorUserId },
        currentBusinessDate: input.currentBusinessDate,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/already.?void|not found|SOURCE_NOT_FOUND/i.test(msg)) throw err;
    }
  }
}
