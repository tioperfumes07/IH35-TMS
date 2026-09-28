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
import { withLuciaBypass } from "../../auth/db.js";

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
};

export async function assignPrintBatch(
  operating_company_id: string,
  actorUserId: string,
  input: { bank_account_id: string; check_type: "voucher" | "standard"; ids: string[] }
): Promise<PrintBatchResult> {
  if (input.ids.length === 0) throw new CheckPrintBatchError("EMPTY_BATCH", "No checks selected to print.");

  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operating_company_id]);

    // Lock the stock-settings row for the duration of this batch so two concurrent print actions on
    // the same bank account cannot both read the same next_check_number.
    const stockRes: { rows: Array<{ next_check_number: string | null }> } = await client.query(
      `SELECT next_check_number::text AS next_check_number
         FROM banking.check_stock_settings
        WHERE bank_account_id = $1::uuid AND operating_company_id = $2::uuid
        FOR UPDATE`,
      [input.bank_account_id, operating_company_id]
    );
    const startRaw = stockRes.rows[0]?.next_check_number;
    if (!startRaw) {
      throw new CheckPrintBatchError(
        "CHECK_STOCK_NOT_INITIALIZED",
        "No starting check number has been set for this bank account. The owner must type the first real number before printing -- never guessed."
      );
    }
    let nextNumber = BigInt(startRaw);

    const checksRes: { rows: Array<{ id: string; total_amount_cents: string; print_on_check_name: string; print_status: string }> } =
      await client.query(
        `SELECT id::text, total_amount_cents::text, print_on_check_name, print_status
           FROM accounting.expenses
          WHERE operating_company_id = $1::uuid AND payment_type = 'check' AND id = ANY($2::uuid[])
          FOR UPDATE`,
        [operating_company_id, input.ids]
      );
    if (checksRes.rows.length !== input.ids.length) {
      throw new CheckPrintBatchError("CHECK_NOT_FOUND", "One or more selected checks do not exist in this company.");
    }
    const notQueued = checksRes.rows.filter((r) => r.print_status !== "need_to_print");
    if (notQueued.length > 0) {
      throw new CheckPrintBatchError(
        "CHECK_NOT_QUEUED_FOR_PRINT",
        `${notQueued.length} selected check(s) are not queued to print (already numbered or already printed).`
      );
    }
    // Preserve caller-supplied order (spec §4: "assigns numbers in order in one transaction").
    const byId = new Map(checksRes.rows.map((r) => [r.id, r]));

    const batchRes: { rows: Array<{ id: string }> } = await client.query(
      `INSERT INTO banking.check_print_batches
         (operating_company_id, bank_account_id, starting_number, check_type, status, created_by_user_id)
       VALUES ($1::uuid, $2::uuid, $3, $4, 'printed', $5::uuid) RETURNING id::text`,
      [operating_company_id, input.bank_account_id, startRaw, input.check_type, actorUserId]
    );
    const printBatchId = batchRes.rows[0].id;

    const assignments: Array<{ check_id: string; check_number: string }> = [];
    for (const id of input.ids) {
      const row = byId.get(id);
      if (!row) continue;
      const checkNumber = nextNumber.toString();
      nextNumber += 1n;

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

    // Numbers are consumed at assignment, not at confirm -- a printer jam mid-batch still burns the
    // numbers it already put ink on (real check stock behaves the same way; a reprint below spoils
    // and moves on rather than reusing).
    await client.query(
      `UPDATE banking.check_stock_settings SET next_check_number = $1::bigint, updated_at = now(), updated_by_user_id = $2::uuid
        WHERE bank_account_id = $3::uuid AND operating_company_id = $4::uuid`,
      [nextNumber.toString(), actorUserId, input.bank_account_id, operating_company_id]
    );

    return { print_batch_id: printBatchId, assignments };
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
