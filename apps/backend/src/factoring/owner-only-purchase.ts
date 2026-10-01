// ROUND 315 (FINAL) OWNER-ONLY LAW (owner, 2026-10-01 16:05Z): after the factoring clean slate (AUTH-193) "NO coder
// creates, closes or matches a purchase — the owner creates every purchase report himself in the app and matches each
// to its deposit." This is the single gate every purchase write path calls: create, advance (funding), reserve-held,
// release and recourse-return (close), the bank-deposit match of a purchase, and the delivery auto-submit (a system
// actor, so always refused). A refusal is a 403 plus one audit row that commits on its own — never rolled back with
// the refused request. Guard: scripts/verify-factoring-purchase-owner-only.mjs.
import type { FastifyReply } from "fastify";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export const FACTORING_PURCHASE_OWNER_ONLY_ERROR = "factoring_purchase_owner_only";

export type FactoringPurchaseAction = "create" | "advance" | "reserve_held" | "release" | "recourse_return" | "bank_match" | "auto_submit";

export class FactoringPurchaseOwnerOnlyError extends Error {
  readonly statusCode = 403;
  constructor(readonly action: FactoringPurchaseAction) {
    super(FACTORING_PURCHASE_OWNER_ONLY_ERROR);
  }
}

/** The actor's role from identity.users when the caller has no session role (service paths carry only a uuid). */
async function resolveActorRole(client: DbClient, userUuid: string | null): Promise<string | null> {
  if (!userUuid) return null;
  const r = await client.query<{ role: string | null }>(
    `SELECT role::text AS role FROM identity.users WHERE id = $1::uuid AND deactivated_at IS NULL LIMIT 1`,
    [userUuid]
  );
  return r.rows[0]?.role ?? null;
}

/**
 * True when the actor is the Owner. Otherwise writes the refusal audit row on `client` (the caller must let that
 * transaction COMMIT — return, do not throw, inside it) and returns false.
 */
export async function checkFactoringPurchaseOwner(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    userUuid: string | null;
    role?: string | null;
    action: FactoringPurchaseAction;
    targetId?: string | null;
  }
): Promise<boolean> {
  const role = input.role ?? (await resolveActorRole(client, input.userUuid));
  if (role === "Owner") return true;
  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
    "factoring.purchase_refused_non_owner",
    "warning",
    JSON.stringify({
      operating_company_id: input.operatingCompanyId,
      action: input.action,
      target_id: input.targetId ?? null,
      actor_role: role,
      law: "ROUND 315 OWNER-ONLY: only the Owner creates, closes or matches a factoring purchase",
    }),
    input.userUuid,
    "owner-only-purchase",
  ]);
  return false;
}

/** Route form: sends the 403 itself. Call inside withCompanyScope and return its boolean out of the scope. */
export async function requireFactoringPurchaseOwner(
  reply: FastifyReply,
  client: DbClient,
  input: Parameters<typeof checkFactoringPurchaseOwner>[1]
): Promise<boolean> {
  if (await checkFactoringPurchaseOwner(client, input)) return true;
  void reply.code(403).send({
    error: FACTORING_PURCHASE_OWNER_ONLY_ERROR,
    message: "Only the Owner creates, closes or matches a factoring purchase.",
  });
  return false;
}
