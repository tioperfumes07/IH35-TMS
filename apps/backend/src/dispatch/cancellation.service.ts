import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { createTonuInvoiceForCancellation, TONU_CANCELLATION_AR_POSTING_FLAG_KEY } from "./cancellation-tonu-invoice.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { emitDispatchSpineEvent } from "./dispatch-spine-emit.js";

function isOwner(role: string) {
  return role === "Owner";
}

/**
 * THE single writer of a load-cancellation record. Client-accepting so it can be called from inside an
 * already-open transaction.
 *
 * Extracted 2026-07-25 (owner decision 4). A SECOND cancel path existed —
 * `PATCH /api/v1/mdata/loads/:id/status` with `new_status="cancelled"`, which the Dispatch Kanban's
 * "Cancelled" drop column calls. It validated the reason against the canonical per-entity catalog, flipped
 * `mdata.loads.status`, and wrote the reason into an audit-log JSON string — but never inserted a
 * `dispatch.load_cancellations` row at all. No `reason_code_id`, no cancellation record, nothing for the
 * reverse surface or the cancellation reports to read. A status→cancelled with no record is a silent failure
 * and an audit gap (Rule 21).
 *
 * Owner ruling: route the Kanban cancel through the SAME canonical flow rather than blocking it. Having ONE
 * client-accepting writer is what makes that true by construction — a second hand-rolled INSERT is exactly
 * how the five copies of the lowest-UUID resolver (LST-F05) happened.
 *
 * Canonical target: `dispatch.load_cancellations.reason_code_id` -> `catalogs.load_cancellation_reasons(id)`
 * (LST-F17 ruling A, per-entity, FORCE RLS). `reason_code` text is kept for display only; the legacy
 * `catalogs.cancellation_reasons` is RETIRE — archived, never written.
 */
export async function writeLoadCancellationRecord(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  input: {
    operating_company_id: string;
    load_id: string;
    reason_code: string;
    reason_code_id: string;
    cancellation_notes: string;
    billable_to_customer: boolean;
    cancellation_charge_cents: number | null;
    status: "requested" | "approved";
    cancelled_by_user_id: string;
    // ACT-F5412: a create-time "approved" cancellation (no owner-approval step needed, or an Owner
    // cancelling directly) must still carry an approver of record — the same actor-provenance
    // requirement the separate two-step approveCancellation() flow already honors. NULL for a
    // "requested" (pending-approval) row; stamped only when status is written as 'approved' here.
    approved_by_user_id: string | null;
  }
) {
  const result = await client.query<{ id: string; status: string }>(
    `
      INSERT INTO dispatch.load_cancellations (
        operating_company_id, load_id, reason_code, reason_code_id, cancellation_notes,
        billable_to_customer, cancellation_charge_cents, status, cancelled_by_user_id, cancelled_at,
        approved_by_user_id, approved_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10,CASE WHEN $10 IS NOT NULL THEN now() ELSE NULL END)
      ON CONFLICT (load_id) DO UPDATE
      SET reason_code = EXCLUDED.reason_code,
          reason_code_id = EXCLUDED.reason_code_id,
          cancellation_notes = EXCLUDED.cancellation_notes,
          billable_to_customer = EXCLUDED.billable_to_customer,
          cancellation_charge_cents = EXCLUDED.cancellation_charge_cents,
          status = EXCLUDED.status,
          cancelled_by_user_id = EXCLUDED.cancelled_by_user_id,
          cancelled_at = EXCLUDED.cancelled_at,
          approved_by_user_id = EXCLUDED.approved_by_user_id,
          approved_at = EXCLUDED.approved_at
      RETURNING id, status
    `,
    [
      input.operating_company_id,
      input.load_id,
      input.reason_code,
      input.reason_code_id,
      input.cancellation_notes,
      input.billable_to_customer,
      input.cancellation_charge_cents,
      input.status,
      input.cancelled_by_user_id,
      input.approved_by_user_id,
    ]
  );
  const cancellation = result.rows[0];
  if (!cancellation?.id) throw new Error("E_CANCELLATION_RECORD_WRITE_FAILED");
  return cancellation;
}

export async function cancelLoad(
  userId: string,
  role: string,
  input: {
    operating_company_id: string;
    load_id: string;
    reason_code: string;
    cancellation_notes: string;
    billable_to_customer?: boolean;
    cancellation_charge_cents?: number;
  }
) {
  if (!input.cancellation_notes || input.cancellation_notes.trim().length < 20) {
    throw new Error("E_CANCELLATION_NOTES_MIN_20");
  }

  return withCurrentUser(userId, async (client) => {
    await setScopedCompanyContext(client, userId, input.operating_company_id);
    await client.query("BEGIN");
    try {
      const loadRes = await client.query(
        `
          SELECT id, status
          FROM mdata.loads
          WHERE id = $1
            AND operating_company_id = $2::uuid
            AND soft_deleted_at IS NULL
          FOR UPDATE
        `,
        [input.load_id, input.operating_company_id]
      );
      if (!loadRes.rows[0]?.id) throw new Error("E_LOAD_NOT_FOUND");

      // LST-F04: select the catalog row's id as well. `reason_code_id` is the CANONICAL link
      // (FK -> catalogs.load_cancellation_reasons, per-entity, FORCE RLS). The legacy `reason_code`
      // text column used to be NOT NULL with an FK to the RETIRE table catalogs.cancellation_reasons
      // (9 global rows) — none of the per-entity codes exist there, so writing only the text made a
      // normal cancel violate a NOT-NULL-backed FK. Migration 202607940000 drops that legacy FK;
      // this writer now persists the canonical id and keeps the text for display only.
      const reasonRes = await client.query<{
        id: string;
        reason_code: string;
        billable_to_customer_default: boolean;
        requires_owner_approval: boolean;
      }>(
        `
          SELECT id, reason_code, billable_to_customer_default, requires_owner_approval
          FROM catalogs.load_cancellation_reasons
          WHERE reason_code = $1
            AND operating_company_id = $2::uuid
            AND is_active = true
          LIMIT 1
        `,
        [input.reason_code, input.operating_company_id]
      );
      const reason = reasonRes.rows[0];
      if (!reason) throw new Error("E_REASON_NOT_FOUND");

      const resolvedBillable = input.billable_to_customer ?? reason.billable_to_customer_default;
      // ACT-F5412: a cancellation marked billable to the customer with no charge amount silently
      // loses the amount to charge — neither the FE nor this route previously enforced the pairing.
      if (resolvedBillable && input.cancellation_charge_cents == null) {
        throw new Error("E_CANCELLATION_CHARGE_REQUIRED_WHEN_BILLABLE");
      }

      const pendingOwnerApproval = reason.requires_owner_approval && !isOwner(role);
      const cancellation = await writeLoadCancellationRecord(client, {
        operating_company_id: input.operating_company_id,
        load_id: input.load_id,
        reason_code: input.reason_code,
        reason_code_id: reason.id,
        cancellation_notes: input.cancellation_notes.trim(),
        billable_to_customer: resolvedBillable,
        cancellation_charge_cents: input.cancellation_charge_cents ?? null,
        status: pendingOwnerApproval ? "requested" : "approved",
        cancelled_by_user_id: userId,
        // ACT-F5412: stamp an approver of record whenever this path writes status='approved' directly
        // (no owner-approval step needed, or the Owner is cancelling directly) — NULL while the
        // cancellation is still "requested" and genuinely awaiting the separate approveCancellation().
        approved_by_user_id: pendingOwnerApproval ? null : userId,
      });

      // ACCT-F5701 — a billable cancellation charge (TONU) used to stop at "captured and displayed"
      // (dispatch.load_cancellations.cancellation_charge_cents) with no path to an invoice / A/R / GL
      // — the money silently evaporated. Reuses the existing revenue resolution + invoice totals
      // machinery (no new GL math); books to the SAME existing Accessorial/Detention Income account
      // every other accessorial line already resolves to (owner ruling, TONU = operating revenue,
      // 2026-07-21; live board answer 2026-08-21: no new account). Flag-gated OFF by default — with
      // the flag off this is a strict no-op, today's behaviour exactly.
      if (!pendingOwnerApproval && resolvedBillable && input.cancellation_charge_cents != null) {
        const tonuFlagOn = await isEnabled(client, TONU_CANCELLATION_AR_POSTING_FLAG_KEY, {
          operating_company_id: input.operating_company_id,
          user_uuid: userId,
        });
        if (tonuFlagOn) {
          const tonuInvoice = await createTonuInvoiceForCancellation(client, {
            operatingCompanyId: input.operating_company_id,
            loadId: input.load_id,
            cancellationChargeCents: input.cancellation_charge_cents,
            actorUserId: userId,
          });
          await client.query(
            `
              UPDATE dispatch.load_cancellations
                 SET charge_invoice_id = $2::uuid,
                     charge_invoice_line_id = $3::uuid,
                     charged_at = now(),
                     charged_by_user_id = $4
               WHERE id = $1
            `,
            [cancellation.id, tonuInvoice.invoiceId, tonuInvoice.invoiceLineId, userId]
          );
        }
      }

      if (!pendingOwnerApproval) {
        const cancelledLoad = await client.query<{ id: string }>(
          `
            UPDATE mdata.loads
            SET status = 'cancelled'::mdata.load_status_enum,
                updated_at = now()
            WHERE id = $1
              AND operating_company_id = $2::uuid
            RETURNING id
          `,
          [input.load_id, input.operating_company_id]
        );
        if (!cancelledLoad.rows[0]?.id) throw new Error("E_CANCELLATION_LOAD_WRITE_FAILED");
      }

      // WIRE-10 — cancelling a load must not leave its money artifacts alive.
      //
      // cancelLoad previously set mdata.loads.status and wrote an audit row, and touched NOTHING else:
      // no invoice, no driver bill, no posting. So a cancelled load kept the proforma invoice created
      // at booking (WIRE-01) and the driver bill created at assign (WIRE-02) — phantom A/R and a
      // phantom payable for work that will never happen. Measured on prod before this change: 1
      // cancelled load, and 1 driver bill still status='open' against it ($960.00).
      //
      // The two artifacts are NOT treated the same, because the money question is not the same:
      //
      //  * A PROFORMA invoice is an explicitly non-posting projection of a load that is now cancelled.
      //    Nothing was recognised and nothing was billed, so voiding it is safe and unambiguous.
      //    Only 'proforma' is voided here — a 'sent' or 'paid' invoice represents a real customer
      //    obligation (a TONU or cancellation charge may be genuinely owed) and voiding that silently
      //    would destroy real A/R. Those are surfaced instead.
      //
      //  * A DRIVER BILL is deliberately NOT auto-voided. A cancelled load can still owe the driver —
      //    truck-ordered-not-used, deadhead already run, a layover already incurred — and blanket
      //    voiding would silently strip pay a driver earned. Whether a specific cancellation owes the
      //    driver is a business decision, not something this function may invent. It is recorded
      //    durably instead, so the payable cannot sit unnoticed the way the $960 one did.
      if (!pendingOwnerApproval) {
        // FAIL-V1: `voided_at` and `void_reason` are NOT optional bookkeeping here — they are half of
        // the void. `accounting.invoices` carries CHECK `invoices_void_state_authoritative`:
        //     (status = 'void') = (voided_at IS NOT NULL)
        // an IFF, so writing `status='void'` alone violates it, and because this runs inside the
        // cancellation transaction the violation rolled back THE WHOLE CANCEL. The visible symptom was
        // not "the invoice kept its status" — it was **a dispatched load could not be cancelled at
        // all**, with a raw constraint name surfacing to the user. Reproduced live on
        // L-20260808-0093 / INV-2026-00024 (still proforma, voided_at NULL).
        //
        // A correct voider already existed and this branch simply was not using it: INV-2026-00020 is
        // void WITH voided_at set. Both halves are written together here so the two can never diverge.
        //
        // `voided_at` itself landed separately while this was in flight; what is added here is
        // `void_reason`, so the row says WHY it was voided rather than only when. A void with no reason
        // is the thing an auditor asks about, and the cancellation is the only place that still knows.
        const voidedInvoices = await client.query<{ id: string }>(
          `
            UPDATE accounting.invoices
               SET status = 'void',
                   voided_at = now(),
                   void_reason = COALESCE(void_reason, $4),
                   updated_at = now(),
                   updated_by_user_id = $3
             WHERE source_load_id = $1::uuid
               AND operating_company_id = $2::uuid
               AND status = 'proforma'
            RETURNING id::text
          `,
          [
            input.load_id,
            input.operating_company_id,
            userId,
            "Load cancelled — proforma voided by the cancellation cascade (FAIL-V1).",
          ]
        );

        const liveInvoices = await client.query<{ id: string; status: string }>(
          `
            SELECT id::text, status::text
              FROM accounting.invoices
             WHERE source_load_id = $1::uuid
               AND operating_company_id = $2::uuid
               AND status NOT IN ('void', 'proforma')
          `,
          [input.load_id, input.operating_company_id]
        );

        const openBills = await client.query<{ bill_number: string; gross_amount_cents: string }>(
          `
            SELECT bill_number, gross_amount_cents::text
              FROM driver_finance.driver_bills
             WHERE load_id = $1::uuid
               AND operating_company_id = $2::uuid
               AND status <> 'void'
          `,
          [input.load_id, input.operating_company_id]
        );

        if (voidedInvoices.rows.length || liveInvoices.rows.length || openBills.rows.length) {
          await appendCrudAudit(
            client,
            userId,
            "dispatch.load.cancellation_money_artifacts",
            {
              resource_type: "mdata.loads",
              resource_id: input.load_id,
              operating_company_id: input.operating_company_id,
              proforma_invoices_voided: voidedInvoices.rows.map((r) => r.id),
              // Left alone on purpose — a real obligation may exist; needs a human decision.
              live_invoices_requiring_review: liveInvoices.rows,
              driver_bills_still_open: openBills.rows.map((r) => ({
                bill_number: r.bill_number,
                gross_amount_cents: Number(r.gross_amount_cents),
              })),
              note:
                "proforma invoices voided automatically; driver bills and non-proforma invoices are " +
                "NOT auto-voided because a cancelled load may still owe money (TONU, deadhead, layover)",
            },
            "warning",
            "WIRE-10"
          );
        }
      }

      await appendCrudAudit(
        client,
        userId,
        "dispatch.load.cancellation_requested",
        {
          resource_type: "mdata.loads",
          resource_id: input.load_id,
          operating_company_id: input.operating_company_id,
          reason_code: input.reason_code,
          pending_owner_approval: pendingOwnerApproval,
        },
        "warning",
        "P5-F4-CANCELLATIONS"
      );

      await emitDispatchSpineEvent(client, {
        operating_company_id: input.operating_company_id,
        actor_user_id: userId,
        event_type: "load.cancelled",
        load_id: input.load_id,
        payload: {
          reason_code: input.reason_code,
          pending_owner_approval: pendingOwnerApproval,
        },
      });

      await client.query("COMMIT");
      return {
        load_id: input.load_id,
        cancellation_id: cancellation.id,
        status: pendingOwnerApproval ? "pending_owner_approval" : "cancelled",
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw translateCancellationDbError(error);
    }
  });
}

/**
 * FAIL-V1: a cancel that trips a void-state CHECK surfaced the raw Postgres constraint name to the
 * user — `invoices_void_state_authoritative` tells a dispatcher nothing, and it hid the fact that the
 * failure was a MONEY-cascade bug rather than anything about their cancellation. Both halves of the
 * void are now written together above, so this path should be unreachable for that constraint; it
 * stays because "unreachable" is exactly what was believed before — the failure was INTERMITTENT, a
 * retry succeeded, and an intermittent fault is precisely the kind that returns. The next void-state
 * divergence should announce itself in words instead of a constraint name.
 *
 * Only the void-state constraints are translated. Every other error is rethrown untouched — swallowing
 * unknown database errors behind a friendly string is how a real failure becomes invisible.
 */
export function translateCancellationDbError(error: unknown): unknown {
  const constraint = (error as { constraint?: string } | null)?.constraint;
  const code = (error as { code?: string } | null)?.code;
  if (code === "23514" && typeof constraint === "string" && /void_state_authoritative/.test(constraint)) {
    const translated = new Error(
      "E_CANCEL_VOID_STATE — the cancellation could not void this load's paperwork: a document was " +
        "marked void without a void timestamp (or the reverse). The load was NOT cancelled and nothing " +
        "was changed. This is a system defect, not a data-entry problem — report it with the load number."
    );
    (translated as { cause?: unknown }).cause = error;
    return translated;
  }
  return error;
}

export async function listCancellations(
  userId: string,
  input: { operating_company_id: string; since?: string }
) {
  return withCurrentUser(userId, async (client) => {
    await setScopedCompanyContext(client, userId, input.operating_company_id);
    const values: unknown[] = [input.operating_company_id];
    const filters = ["c.operating_company_id = $1::uuid"];
    if (input.since) {
      values.push(input.since);
      filters.push(`c.cancelled_at >= $${values.length}::timestamptz`);
    }
    const rows = await client.query(
      `
        SELECT c.*, r.display_name AS reason_label
        FROM dispatch.load_cancellations c
        JOIN catalogs.load_cancellation_reasons r
          ON r.reason_code = c.reason_code
         AND r.operating_company_id = c.operating_company_id
        WHERE ${filters.join(" AND ")}
        ORDER BY c.cancelled_at DESC
      `,
      values
    );
    return { rows: rows.rows };
  });
}

export async function listCancellationReasons(userId: string, operatingCompanyId: string) {
  return withCurrentUser(userId, async (client) => {
    await setScopedCompanyContext(client, userId, operatingCompanyId);
    const rows = await client.query(
      `
        SELECT
          reason_code,
          display_name AS reason_label,
          billable_to_customer_default,
          requires_owner_approval,
          sort_order
        FROM catalogs.load_cancellation_reasons
        WHERE operating_company_id = $1::uuid
          AND is_active = true
        ORDER BY sort_order ASC, display_name ASC
      `,
      [operatingCompanyId]
    );
    return { reasons: rows.rows };
  });
}

export async function approveCancellation(
  userId: string,
  role: string,
  input: { operating_company_id: string; cancellation_id: string }
) {
  if (!isOwner(role)) throw new Error("E_OWNER_ONLY");
  return withCurrentUser(userId, async (client) => {
    await setScopedCompanyContext(client, userId, input.operating_company_id);
    await client.query("BEGIN");
    try {
      const row = await client.query<{ id: string; load_id: string; status: string }>(
        `
          UPDATE dispatch.load_cancellations
          SET status = 'approved',
              approved_by_user_id = $2,
              approved_at = now()
          WHERE id = $1
            AND operating_company_id = $3::uuid
          RETURNING id, load_id, status
        `,
        [input.cancellation_id, userId, input.operating_company_id]
      );
      const cancellation = row.rows[0];
      if (!cancellation) throw new Error("E_NOT_FOUND");
      await client.query(
        `
          UPDATE mdata.loads
          SET status = 'cancelled'::mdata.load_status_enum,
              updated_at = now()
          WHERE id = $1
        `,
        [cancellation.load_id]
      );
      await appendCrudAudit(
        client,
        userId,
        "dispatch.load.cancellation_approved",
        {
          resource_type: "dispatch.load_cancellations",
          resource_id: input.cancellation_id,
          operating_company_id: input.operating_company_id,
          load_id: cancellation.load_id,
        },
        "warning",
        "P5-F4-CANCELLATIONS"
      );
      await emitDispatchSpineEvent(client, {
        operating_company_id: input.operating_company_id,
        actor_user_id: userId,
        event_type: "load.cancellation_approved",
        load_id: cancellation.load_id,
      });
      await client.query("COMMIT");
      return { id: input.cancellation_id, load_id: cancellation.load_id, status: "approved" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
