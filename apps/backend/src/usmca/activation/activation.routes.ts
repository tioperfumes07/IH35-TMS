/**
 * CLOSURE-13 — USMCA activation state machine routes.
 */
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { validateTransition, CHECKLIST_ITEMS, type ActivationState } from "./activation-state-machine.js";

const activationStateSchema = z.enum(["hidden", "soft_launch", "pilot_drivers", "full_active", "rollback"]);
const transitionBodySchema = z.object({ requested_state: activationStateSchema, notes: z.string().max(500).optional() });
const checklistPatchSchema = z.object({ item_id: z.string(), completed: z.boolean() });

function auth(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function ownerOnly(req: FastifyRequest, reply: FastifyReply) {
  const user = auth(req, reply);
  if (!user) return null;
  if (user.role !== "Owner") { reply.code(403).send({ error: "forbidden" }); return null; }
  return user;
}

export async function registerUsmcaActivationRoutes(app: FastifyInstance) {
  app.get("/api/v1/usmca/activation/state", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const result = await withCurrentUser(user.uuid, async (client) => {
      const stateRow = await client.query<{
        id: string; state: string; activated_at: string | null;
        go_live_target_date: string; checklist_completed: string;
      }>("SELECT id, state, activated_at, go_live_target_date, checklist_completed FROM usmca_ops.activation_state LIMIT 1");
      const row = stateRow.rows[0];
      if (!row) return { state: "hidden", checklist: CHECKLIST_ITEMS, go_live_target_date: "2026-07-01" };
      const completedIds = Object.keys(JSON.parse(typeof row.checklist_completed === "string" ? row.checklist_completed : "{}") as Record<string, boolean>)
        .filter((k) => (JSON.parse(typeof row.checklist_completed === "string" ? row.checklist_completed : "{}") as Record<string, boolean>)[k]);
      const checklist = CHECKLIST_ITEMS.map((item) => ({ ...item, completed: completedIds.includes(item.id) }));
      return { state: row.state, checklist, go_live_target_date: row.go_live_target_date, activated_at: row.activated_at };
    });
    return result;
  });

  app.post("/api/v1/usmca/activation/transition", async (req, reply) => {
    const user = ownerOnly(req, reply);
    if (!user) return;
    const body = transitionBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const result = await withCurrentUser(user.uuid, async (client) => {
      const stateRow = await client.query<{ id: string; state: string; checklist_completed: string }>(
        "SELECT id, state, checklist_completed FROM usmca_ops.activation_state LIMIT 1"
      );
      const current = (stateRow.rows[0]?.state ?? "hidden") as ActivationState;
      const completedObj = JSON.parse(typeof stateRow.rows[0]?.checklist_completed === "string" ? stateRow.rows[0]?.checklist_completed : "{}") as Record<string, boolean>;
      const completedIds = Object.keys(completedObj).filter((k) => completedObj[k]);
      const { valid, reason } = validateTransition(current, body.data.requested_state, completedIds);
      if (!valid) return reply.code(422).send({ error: "transition_blocked", reason });

      await client.query(
        "UPDATE usmca_ops.activation_state SET state = $1, activated_at = now(), activated_by_user_id = $2, updated_at = now()",
        [body.data.requested_state, user.uuid]
      );
      await client.query(
        "INSERT INTO usmca_ops.activation_audit (from_state, to_state, transitioned_by_user_id, notes) VALUES ($1, $2, $3, $4)",
        [current, body.data.requested_state, user.uuid, body.data.notes ?? null]
      );
      return { ok: true, from: current, to: body.data.requested_state };
    });
    return result;
  });

  app.patch("/api/v1/usmca/activation/checklist-item", async (req, reply) => {
    const user = ownerOnly(req, reply);
    if (!user) return;
    const body = checklistPatchSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    await withCurrentUser(user.uuid, async (client) => {
      await client.query(
        `UPDATE usmca_ops.activation_state SET checklist_completed = jsonb_set(checklist_completed, ARRAY[$1], $2::jsonb, true), updated_at = now()`,
        [body.data.item_id, String(body.data.completed)]
      );
    });
    return { ok: true };
  });
}

export default fp(
  async (app) => { await registerUsmcaActivationRoutes(app); },
  { name: "usmca.activation" }
);
