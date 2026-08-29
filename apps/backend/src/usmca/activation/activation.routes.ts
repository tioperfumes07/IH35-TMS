/**
 * CLOSURE-13 — USMCA activation state machine routes.
 */
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import {
  validateTransition,
  CHECKLIST_ITEMS,
  CHECKLIST_ITEM_IDS,
  parseChecklistCompleted,
  type ActivationState,
} from "./activation-state-machine.js";

const activationStateSchema = z.enum(["hidden", "soft_launch", "pilot_drivers", "full_active", "rollback"]);
const transitionBodySchema = z.object({ requested_state: activationStateSchema, notes: z.string().max(500).optional() });
const checklistPatchSchema = z.object({
  item_id: z.string().refine((id) => CHECKLIST_ITEM_IDS.includes(id), "Unknown activation checklist item"),
  completed: z.boolean(),
});

type ActivationStateRow = {
  id: string;
  state: string;
  activated_at?: string | null;
  go_live_target_date?: string;
  checklist_completed: unknown;
};

async function getSingletonActivationState(
  client: { query: <T>(sql: string) => Promise<{ rows: T[] }> },
  lock = false
): Promise<ActivationStateRow | undefined> {
  const result = await client.query<ActivationStateRow>(
    `SELECT id, state, activated_at, go_live_target_date, checklist_completed
       FROM usmca_ops.activation_state
      ORDER BY created_at ASC, id ASC
      LIMIT 2${lock ? " FOR UPDATE" : ""}`
  );
  if (result.rows.length > 1) throw new Error("USMCA activation state singleton invariant violated");
  return result.rows[0];
}

function auth(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function ownerOnly(req: FastifyRequest, reply: FastifyReply) {
  const user = auth(req, reply);
  if (!user) return null;
  if (user.role !== "Owner") { reply.code(403).send({ error: "forbidden" }); return null; }
  return user;
}

export async function registerUsmcaActivationRoutes(app: FastifyInstance) {
  app.get("/api/v1/usmca/activation/state", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const result = await withCurrentUser(user.uuid, async (client) => {
      const row = await getSingletonActivationState(client);
      if (!row) return { state: "hidden", checklist: CHECKLIST_ITEMS, go_live_target_date: "2026-07-01" };
      const completed = parseChecklistCompleted(row.checklist_completed);
      const completedIds = Object.keys(completed).filter((id) => completed[id]);
      const checklist = CHECKLIST_ITEMS.map((item) => ({ ...item, completed: completedIds.includes(item.id) }));
      return { state: row.state, checklist, go_live_target_date: row.go_live_target_date, activated_at: row.activated_at };
    });
    return result;
  });

  app.post("/api/v1/usmca/activation/transition", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ownerOnly(req, reply);
    if (!user) return;
    const body = transitionBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const result = await withCurrentUser(user.uuid, async (client) => {
      const stateRow = await getSingletonActivationState(client, true);
      if (!stateRow) return reply.code(409).send({ error: "activation_state_missing" });
      const current = stateRow.state as ActivationState;
      const completedObj = parseChecklistCompleted(stateRow.checklist_completed);
      const completedIds = Object.keys(completedObj).filter((k) => completedObj[k]);
      const { valid, reason } = validateTransition(current, body.data.requested_state, completedIds);
      if (!valid) return reply.code(422).send({ error: "transition_blocked", reason });

      await client.query(
        `UPDATE usmca_ops.activation_state
            SET state = $1,
                activated_at = CASE WHEN $1 IN ('soft_launch', 'pilot_drivers', 'full_active') THEN now() ELSE activated_at END,
                rollback_at = CASE WHEN $1 = 'rollback' THEN now() WHEN $1 = 'hidden' THEN NULL ELSE rollback_at END,
                activated_by_user_id = $2,
                updated_at = now()
          WHERE id = $3`,
        [body.data.requested_state, user.uuid, stateRow.id]
      );
      await client.query(
        `INSERT INTO usmca_ops.activation_audit
           (from_state, to_state, transitioned_by_user_id, notes, checklist_snapshot)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [current, body.data.requested_state, user.uuid, body.data.notes ?? null, JSON.stringify(completedObj)]
      );
      return { ok: true, from: current, to: body.data.requested_state };
    });
    return result;
  });

  app.patch("/api/v1/usmca/activation/checklist-item", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ownerOnly(req, reply);
    if (!user) return;
    const body = checklistPatchSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    await withCurrentUser(user.uuid, async (client) => {
      const stateRow = await getSingletonActivationState(client, true);
      if (!stateRow) return reply.code(409).send({ error: "activation_state_missing" });
      await client.query(
        `UPDATE usmca_ops.activation_state
            SET checklist_completed = jsonb_set(checklist_completed, ARRAY[$1], $2::jsonb, true), updated_at = now()
          WHERE id = $3`,
        [body.data.item_id, String(body.data.completed), stateRow.id]
      );
    });
    return { ok: true };
  });
}

export default fp(
  async (app) => { await registerUsmcaActivationRoutes(app); },
  { name: "usmca.activation" }
);
