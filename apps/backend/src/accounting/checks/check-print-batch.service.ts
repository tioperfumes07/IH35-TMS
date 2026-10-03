// R-154 §4 (PR 5/7) — check-number assignment + print-batch confirm/reprint.
//
// Numbers are assigned ONLY at print time (spec §3c: never guessed/defaulted; the owner types the
// first real number via banking.check_stock_settings.next_check_number, checked here, never seeded).
// A print-later check (print_status='need_to_print', check_number NULL) is what this queues; a check
// created with a number already (print_later=false, PR 3/7) never enters this flow.
//
// PDF rendering (spec §4's GET /:id/render.pdf, amount-in-words, the actual printable check face) is
// explicitly OUT of scope for this PR -- this is the number-assignment + registry/audit-trail half
// only, disclosed rather than silently missing. A print batch can be assigned and confirmed/reprinted
// correctly without yet having a PDF to show for it; the numbers and registry rows are the part that
// must never be wrong.
import type { PoolClient } from "pg";
import { withLuciaBypass } from "../../auth/db.js";
import { CheckNumberPlanError, planCheckNumbers, type CheckNumberGap } from "./check-number-plan.js";

export class CheckPrintBatchError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "CheckPrintBatchError";
    this.code = code;
  }
}

export type PrintBatchResult = {
  print_batch_id: string;
  assignments: Array<{ check_id: string; check_number: string }>;
  skipped: CheckNumberGap[];
};

export type PrintBatchInput = {
  bank_account_id: string;
  check_type: "voucher" | "standard";
  ids: string[];
  /** U9 — the owner's typed number per id (same order); empty = continue the sequence from the row above. */
  numbers?: Array<string | null>;
  /** U9 — required when the numbers skip unused check-stock leaves; recorded on each skipped number. */
  gap_reason?: string | null;
};

export type PrintBatchDuplicate = { check_number: string; held_by: string };

export type PrintBatchPreview = {
  next_on_file: string | null;
  assignments: Array<{ check_id: string; check_number: string }>;
  duplicates: PrintBatchDuplicate[];
  gaps: CheckNumberGap[];
  gap_count: number;
  next_after: string;
};

function planError(err: unknown): never {
  if (err instanceof CheckNumberPlanError) throw new CheckPrintBatchError(err.code, err.message);
  throw err;
}

/** Every number already used on this bank account, by any writer, inside [lo, hi] plus the batch's own numbers. */
async function heldCheckNumbers(
  client: PoolClient,
  operating_company_id: string,
  bank_account_id: string,
  candidates: string[],
  lo: string,
  hi: string
): Promise<Map<string, string>> {
  const res: { rows: Array<{ check_number: string; held_by: string }> } = await client.query(
    `WITH held AS (
       SELECT r.check_number, CASE r.source_kind WHEN 'bill_payment' THEN 'a bill payment' WHEN 'driver_settlement_payment' THEN 'a driver settlement payment' ELSE 'a check' END
              || CASE WHEN r.status IN ('voided', 'spoiled') THEN ' (' || r.status || ')' ELSE '' END
              || COALESCE(' to ' || NULLIF(r.payee_label, ''), '') AS held_by
         FROM banking.check_number_registry r
        WHERE r.operating_company_id = $1::uuid AND r.bank_account_id = $2::uuid
       UNION ALL
       SELECT e.check_number, 'an expense check' || COALESCE(' to ' || NULLIF(e.print_on_check_name, ''), '')
         FROM accounting.expenses e
         JOIN banking.bank_accounts ba ON ba.ledger_account_id = e.payment_account_uuid
        WHERE e.operating_company_id = $1::uuid AND ba.id = $2::uuid AND e.payment_type = 'check' AND e.check_number IS NOT NULL
       UNION ALL
       SELECT bp.check_number, 'a bill payment'
         FROM accounting.bill_payments bp
         JOIN accounting.bills b ON b.id = bp.bill_id
        WHERE b.operating_company_id = $1::uuid AND bp.from_bank_account_id = $2::uuid AND bp.payment_method = 'check'
          AND bp.check_number IS NOT NULL
     )
     SELECT DISTINCT ON (n) n AS check_number, held_by
       FROM (SELECT CASE WHEN btrim(check_number) ~ '^[0-9]{1,12}$' THEN (btrim(check_number)::bigint)::text END AS n, held_by FROM held) h
      WHERE n IS NOT NULL AND (n = ANY($3::text[]) OR n::bigint BETWEEN $4::bigint AND $5::bigint)
      ORDER BY n, held_by`,
    [operating_company_id, bank_account_id, candidates, lo, hi]
  );
  return new Map(res.rows.map((r) => [r.check_number, r.held_by]));
}

async function loadQueuedChecks(client: PoolClient, operating_company_id: string, ids: string[], lock: boolean) {
  const checksRes: { rows: Array<{ id: string; total_amount_cents: string; print_on_check_name: string; print_status: string }> } =
    await client.query(
      `SELECT id::text, total_amount_cents::text, print_on_check_name, print_status
         FROM accounting.expenses
        WHERE operating_company_id = $1::uuid AND payment_type = 'check' AND id = ANY($2::uuid[]) AND voided_at IS NULL
        ${lock ? "FOR UPDATE" : ""}`,
      [operating_company_id, ids]
    );
  if (checksRes.rows.length !== new Set(ids).size || new Set(ids).size !== ids.length) {
    throw new CheckPrintBatchError("CHECK_NOT_FOUND", "One or more selected checks do not exist in this company.");
  }
  const notQueued = checksRes.rows.filter((r) => r.print_status !== "need_to_print");
  if (notQueued.length > 0) {
    throw new CheckPrintBatchError(
      "CHECK_NOT_QUEUED_FOR_PRINT",
      `${notQueued.length} selected check(s) are not queued to print (already numbered or already printed).`
    );
  }
  return new Map(checksRes.rows.map((r) => [r.id, r]));
}

async function buildPreview(client: PoolClient, operating_company_id: string, input: PrintBatchInput, lock: boolean) {
  // Lock the stock-settings row for the duration of an assignment so two concurrent print actions on the same bank
  // account cannot both read the same next_check_number.
  const stockRes: { rows: Array<{ next_check_number: string | null }> } = await client.query(
    `SELECT next_check_number::text AS next_check_number
       FROM banking.check_stock_settings
      WHERE bank_account_id = $1::uuid AND operating_company_id = $2::uuid
      ${lock ? "FOR UPDATE" : ""}`,
    [input.bank_account_id, operating_company_id]
  );
  const nextOnFile = stockRes.rows[0]?.next_check_number ?? null;
  const byId = await loadQueuedChecks(client, operating_company_id, input.ids, lock);

  let plan;
  try {
    plan = planCheckNumbers(nextOnFile, input.ids.length, input.numbers ?? [], new Set());
  } catch (err) {
    planError(err);
  }
  const lo = [nextOnFile ?? plan.numbers[0], ...plan.numbers].reduce((m, n) => (BigInt(n) < BigInt(m) ? n : m));
  const hi = plan.numbers.reduce((m, n) => (BigInt(n) > BigInt(m) ? n : m));
  const held = await heldCheckNumbers(client, operating_company_id, input.bank_account_id, plan.numbers, lo, hi);
  try {
    plan = planCheckNumbers(nextOnFile, input.ids.length, input.numbers ?? [], new Set(held.keys()));
  } catch (err) {
    planError(err);
  }

  const duplicates: PrintBatchDuplicate[] = [];
  for (const n of plan.numbers) {
    const by = held.get(n);
    if (by && !duplicates.some((d) => d.check_number === n)) duplicates.push({ check_number: n, held_by: by });
  }
  for (const n of plan.in_batch_duplicates) {
    if (!duplicates.some((d) => d.check_number === n)) duplicates.push({ check_number: n, held_by: "another check in this print batch" });
  }
  const preview: PrintBatchPreview = {
    next_on_file: nextOnFile,
    assignments: input.ids.map((id, i) => ({ check_id: id, check_number: plan.numbers[i] })),
    duplicates,
    gaps: plan.gaps,
    gap_count: plan.gap_count,
    next_after: plan.next_after,
  };
  return { preview, byId };
}

/** U9 — read-only: the numbers this batch would print, any duplicate, any skipped check-stock leaves. */
export async function previewPrintBatch(operating_company_id: string, input: PrintBatchInput): Promise<PrintBatchPreview> {
  if (input.ids.length === 0) throw new CheckPrintBatchError("EMPTY_BATCH", "No checks selected to print.");
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operating_company_id]);
    return (await buildPreview(client, operating_company_id, input, false)).preview;
  });
}

export async function assignPrintBatch(
  operating_company_id: string,
  actorUserId: string,
  input: PrintBatchInput
): Promise<PrintBatchResult> {
  if (input.ids.length === 0) throw new CheckPrintBatchError("EMPTY_BATCH", "No checks selected to print.");

  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operating_company_id]);
    const { preview, byId } = await buildPreview(client, operating_company_id, input, true);

    if (preview.duplicates.length > 0) {
      throw new CheckPrintBatchError(
        "DUPLICATE_CHECK_NUMBER",
        `Check number${preview.duplicates.length > 1 ? "s" : ""} already used on this bank account: ${preview.duplicates
          .map((d) => `#${d.check_number} (${d.held_by})`)
          .join(", ")}. Type a different number.`
      );
    }
    const gapReason = input.gap_reason?.trim() ?? "";
    if (preview.gap_count > 0 && gapReason.length < 3) {
      throw new CheckPrintBatchError(
        "GAP_REASON_REQUIRED",
        `These numbers skip ${preview.gap_count} unused check${preview.gap_count > 1 ? "s" : ""} (${preview.gaps
          .map((g) => (g.from === g.to ? `#${g.from}` : `#${g.from}–#${g.to}`))
          .join(", ")}). Give the reason they are skipped -- it is recorded on each skipped number.`
      );
    }

    const startRaw = preview.assignments[0].check_number;
    const batchRes: { rows: Array<{ id: string }> } = await client.query(
      `INSERT INTO banking.check_print_batches
         (operating_company_id, bank_account_id, starting_number, check_type, status, created_by_user_id)
       VALUES ($1::uuid, $2::uuid, $3, $4, 'printed', $5::uuid) RETURNING id::text`,
      [operating_company_id, input.bank_account_id, startRaw, input.check_type, actorUserId]
    );
    const printBatchId = batchRes.rows[0].id;

    // Preserve caller-supplied order (spec §4: "assigns numbers in order in one transaction").
    const assignments: Array<{ check_id: string; check_number: string }> = [];
    for (const { check_id: id, check_number: checkNumber } of preview.assignments) {
      const row = byId.get(id);
      if (!row) continue;

      const registryRes: { rows: Array<{ id: string }> } = await client.query(
        `INSERT INTO banking.check_number_registry
           (operating_company_id, bank_account_id, check_number, source_kind, source_id, status, amount_cents, payee_label, created_by_user_id)
         VALUES ($1::uuid, $2::uuid, $3, 'check', $4::uuid, 'printed', $5::bigint, $6, $7::uuid)
         RETURNING id::text`,
        [operating_company_id, input.bank_account_id, checkNumber, id, row.total_amount_cents, row.print_on_check_name, actorUserId]
      );
      const registryId = registryRes.rows[0].id;

      await client.query(
        `UPDATE accounting.expenses
            SET check_number = $1, print_status = 'print_complete', printed_at = now(), printed_by_user_id = $2::uuid, print_batch_id = $3::uuid
          WHERE id = $4::uuid`,
        [checkNumber, actorUserId, printBatchId, id]
      );
      await client.query(
        `INSERT INTO banking.check_print_batch_items (operating_company_id, print_batch_id, registry_id, outcome)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'pending')`,
        [operating_company_id, printBatchId, registryId]
      );
      assignments.push({ check_id: id, check_number: checkNumber });
    }

    // U9 — every skipped check-stock leaf is recorded as a voided number with the owner's reason, so the register
    // accounts for every number in the book (a missing number is otherwise indistinguishable from a lost check).
    for (const gap of preview.gaps) {
      for (let n = BigInt(gap.from); n <= BigInt(gap.to); n += 1n) {
        await client.query(
          `INSERT INTO banking.check_number_registry
             (operating_company_id, bank_account_id, check_number, source_kind, source_id, status, amount_cents, payee_label,
              created_by_user_id, voided_at, void_reason, voided_by_user_id)
           VALUES ($1::uuid, $2::uuid, $3, 'check', NULL, 'voided', 0, NULL, $4::uuid, now(), $5, $4::uuid)`,
          [operating_company_id, input.bank_account_id, n.toString(), actorUserId, `Skipped at print (batch ${printBatchId}): ${gapReason}`]
        );
      }
    }

    // Numbers are consumed at assignment, not at confirm -- a printer jam mid-batch still burns the
    // numbers it already put ink on (real check stock behaves the same way; a reprint below spoils
    // and moves on rather than reusing). U9 — the sequence continues from the highest number printed.
    await client.query(
      `INSERT INTO banking.check_stock_settings (bank_account_id, operating_company_id, next_check_number, check_type, updated_at, updated_by_user_id)
       VALUES ($3::uuid, $4::uuid, $1::bigint, $5, now(), $2::uuid)
       ON CONFLICT (bank_account_id) DO UPDATE SET next_check_number = EXCLUDED.next_check_number, updated_at = now(),
         updated_by_user_id = EXCLUDED.updated_by_user_id`,
      [preview.next_after, actorUserId, input.bank_account_id, operating_company_id, input.check_type]
    );

    return { print_batch_id: printBatchId, assignments, skipped: preview.gaps };
  });
}

export type ConfirmPrintBatchInput = { all_ok: true } | { reprint_from_number: string };

export async function confirmPrintBatch(
  operating_company_id: string,
  actorUserId: string,
  printBatchId: string,
  input: ConfirmPrintBatchInput
): Promise<{ status: "confirmed" | "reprinting"; spoiled_check_ids: string[] }> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operating_company_id]);

    const batchRes: { rows: Array<{ id: string; bank_account_id: string; status: string }> } = await client.query(
      `SELECT id::text, bank_account_id::text, status FROM banking.check_print_batches
        WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
      [printBatchId, operating_company_id]
    );
    const batch = batchRes.rows[0];
    if (!batch) throw new CheckPrintBatchError("PRINT_BATCH_NOT_FOUND");
    if (batch.status === "confirmed") throw new CheckPrintBatchError("PRINT_BATCH_ALREADY_CONFIRMED");

    const itemsRes: {
      rows: Array<{ item_id: string; registry_id: string; check_number: string; check_id: string }>;
    } = await client.query(
      `SELECT i.id::text AS item_id, r.id::text AS registry_id, r.check_number, r.source_id::text AS check_id
         FROM banking.check_print_batch_items i
         JOIN banking.check_number_registry r ON r.id = i.registry_id
        WHERE i.print_batch_id = $1::uuid
        ORDER BY r.check_number::bigint ASC`,
      [printBatchId]
    );

    if ("all_ok" in input && input.all_ok) {
      for (const item of itemsRes.rows) {
        await client.query(`UPDATE banking.check_print_batch_items SET outcome = 'ok' WHERE id = $1::uuid`, [item.item_id]);
        await client.query(`UPDATE banking.check_number_registry SET status = 'printed' WHERE id = $1::uuid`, [item.registry_id]);
      }
      await client.query(
        `UPDATE banking.check_print_batches SET status = 'confirmed', confirmed_at = now(), confirmed_by_user_id = $2::uuid WHERE id = $1::uuid`,
        [printBatchId, actorUserId]
      );
      return { status: "confirmed", spoiled_check_ids: [] };
    }

    // reprint_from_number: everything from that number onward misprinted -- spoil, requeue the check
    // to print again (a later batch gets it FRESH numbers), leave earlier numbers in the batch as-is
    // (still 'pending' until a follow-up confirm closes them out).
    const reprintFrom = BigInt((input as { reprint_from_number: string }).reprint_from_number);
    const spoiledCheckIds: string[] = [];
    for (const item of itemsRes.rows) {
      if (BigInt(item.check_number) < reprintFrom) continue;
      await client.query(`UPDATE banking.check_print_batch_items SET outcome = 'spoiled' WHERE id = $1::uuid`, [item.item_id]);
      await client.query(
        `UPDATE banking.check_number_registry SET status = 'spoiled', voided_at = now(), void_reason = 'reprint', voided_by_user_id = $2::uuid WHERE id = $1::uuid`,
        [item.registry_id, actorUserId]
      );
      await client.query(
        `UPDATE accounting.expenses SET check_number = NULL, print_status = 'need_to_print', print_batch_id = NULL, printed_at = NULL, printed_by_user_id = NULL
          WHERE id = $1::uuid`,
        [item.check_id]
      );
      spoiledCheckIds.push(item.check_id);
    }
    await client.query(`UPDATE banking.check_print_batches SET status = 'reprinting' WHERE id = $1::uuid`, [printBatchId]);
    return { status: "reprinting", spoiled_check_ids: spoiledCheckIds };
  });
}
