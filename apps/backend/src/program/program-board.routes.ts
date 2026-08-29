// Program Board routes — NON-FINANCIAL internal tooling. Auth-gated to any authenticated staff.
//   GET  /api/v1/program/board          → blocks + owner tracks + sequence + two-way notes (CT stamps)
//   POST /api/v1/program/board/notes     → owner adds an answer/idea/note (author forced 'owner')
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { getProgramBoard, insertOwnerNote } from "./program-board.service.js";
import { computeProgramTrackerLive } from "./program-tracker.service.js";
import { loadModuleCompletionBoard } from "./module-completion-live.service.js";

const noteSchema = z.object({
  block_id: z.string().trim().min(1).max(200).nullish(),
  kind: z.enum(["answer", "idea", "note"]),
  body: z.string().trim().min(1).max(10000),
});

export async function registerProgramBoardRoutes(app: FastifyInstance) {
  // Read the whole board. Any authed staff (office or driver) may view.
  app.get("/api/v1/program/board", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const user = req.user as { uuid: string };
    const board = await withCurrentUser(user.uuid, (client) => getProgramBoard(client));
    return reply.send(board);
  });

  // Owner posts an answer/idea/note. author is derived server-side ('owner') — never trusted from body.
  app.post("/api/v1/program/board/notes", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const user = req.user as { uuid: string };
    const parsed = noteSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }
    try {
      const note = await withCurrentUser(user.uuid, (client) =>
        insertOwnerNote(client, user.uuid, {
          block_id: parsed.data.block_id ?? null,
          kind: parsed.data.kind,
          body: parsed.data.body,
        })
      );
      return reply.code(201).send(note);
    } catch (err) {
      // The backing table (ops.program_board_notes) is created by a gated migration. Until it lands,
      // surface a clear 503 instead of a raw 500 so the UI can message "persistence not yet enabled".
      req.log.error({ err }, "program board note insert failed");
      return reply
        .code(503)
        .send({ error: "notes_unavailable", message: "Program Board notes storage is not yet enabled (pending migration)." });
    }
  });

  // Build-Progress tracker — read-only, recomputed LIVE per request from the deployed repo artifacts
  // (phase manifest + reconcile:blocks registry + held-migrations). Honest failure (§0): if a required
  // artifact is unreadable, return 503 with an explicit error so the page shows an error state, never
  // stale/placeholder numbers.
  app.get("/api/v1/program/tracker", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    try {
      return reply.send(await computeProgramTrackerLive(new Date()));
    } catch (err) {
      req.log.error({ err }, "program tracker compute failed");
      return reply
        .code(503)
        .send({ error: "tracker_unavailable", message: "Program tracker source (phase manifest / block registry) is unreadable in this deploy." });
    }
  });

  app.get(
    "/api/v1/program/module-completion",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      try {
        return reply.send(await loadModuleCompletionBoard());
      } catch (err) {
        req.log.error({ err }, "module-completion board read failed");
        return reply.code(503).send({
          error: "module_completion_unavailable",
          message: "Module completion manifests are unreadable in this API process.",
        });
      }
    }
  );
}
