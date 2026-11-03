/**
 * expense-load-confirm-actor.ts — OWNER RULING 443.288 (10-23-2026): "when setting on a load an expense, the dispatcher or
 * closer whatever must confirm them. always. i dont want to rely in a system that constantly fails."
 *
 * THE one writer of the transaction's confirming actor (app.expense_load_confirm_actor). The database trigger
 * accounting.expense_load_confirmation_rule (202616230700) turns every load write into 'proposed' unless this setting
 * names a person; then it is 'confirmed' by that person. Nothing else in apps/backend/src may set it (guard
 * scripts/verify-443-288-person-confirms-load.mjs).
 *
 * Row 102 (11-03): a machine is never a person. The background-job actor (SYSTEM_ACTOR_USER_ID — a real identity.users
 * row, so it passed the UUID check) could confirm a load if any job ever reached a person-chosen writer. It is refused
 * by name here: MACHINE_CANNOT_CONFIRM_LOAD.
 */
import { SYSTEM_ACTOR_USER_ID } from "../lib/system-actor.js";

type Db = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

export class ExpenseLoadConfirmRefused extends Error {
  /** answered 409 by name (Fastify sends statusCode + code + message) from every route that reaches it */
  public readonly statusCode = 409;
  constructor(public readonly code: string, message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "ExpenseLoadConfirmRefused";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ids that are machines, never a person: the background-job actor (env override included) and its default. */
export const MACHINE_ACTOR_IDS: ReadonlySet<string> = new Set(
  [SYSTEM_ACTOR_USER_ID, "00000000-0000-4000-8000-000000000001"].map((x) => x.toLowerCase()),
);

/** Refuses (by name) an actor that is a machine. A non-UUID actor is not a person either (CONFIRMING_USER_INVALID). */
export function assertPersonConfirmsLoad(userId: string): void {
  if (!UUID.test(userId)) throw new ExpenseLoadConfirmRefused("CONFIRMING_USER_INVALID", "A load is confirmed by a signed-in person.");
  if (MACHINE_ACTOR_IDS.has(userId.toLowerCase())) {
    throw new ExpenseLoadConfirmRefused(
      "MACHINE_CANNOT_CONFIRM_LOAD",
      "A machine never confirms an expense's load — a dispatcher or the closer does (OWNER RULING 443.288).",
      { actor_user_id: userId },
    );
  }
}

/**
 * A route where a PERSON chose the load marks its whole transaction: every load it writes is confirmed by that person
 * (transaction-local; ends with the transaction). Used by: Settlement Creator post (the closer), expense relink,
 * expense entered with its load, reclassify by load, the fuel assignment answer. A non-UUID actor leaves the writes
 * 'proposed' (no person); a machine actor is refused by name.
 */
export async function markExpenseLoadConfirmedBy(client: Db, userId: string): Promise<void> {
  if (!UUID.test(userId)) return;
  assertPersonConfirmsLoad(userId);
  await client.query("SELECT set_config('app.expense_load_confirm_actor', $1::text, true)", [userId]);
}

/** Run `fn` with this person as the confirming actor (transaction-local); the actor is cleared afterwards. */
export async function withExpenseLoadConfirmedBy<T>(client: Db, userId: string, fn: () => Promise<T>): Promise<T> {
  assertPersonConfirmsLoad(userId);
  await client.query("SELECT set_config('app.expense_load_confirm_actor', $1::text, true)", [userId]);
  try {
    return await fn();
  } finally {
    await client.query("SELECT set_config('app.expense_load_confirm_actor', '', true)");
  }
}
