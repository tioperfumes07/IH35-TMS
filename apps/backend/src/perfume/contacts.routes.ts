/**
 * PERFUME-CONTACTS routes — /api/v1/perfume/contacts/* and /api/v1/perfume/prospects/*. Owner + desk user only, like every
 * perfume route (RLS perfume.is_owner() underneath).
 *
 * Owner 2026-11-25 22:04 / 22:11 CT — the contacts database (vendors, customers, both; how, where and when each started).
 * Owner 2026-11-25 22:09 CT — "Yes ask for it and I want is possible all the data": Google business search, full fields.
 * Research session ROUND P1.4 #5 — the first batch is one city (Nuevo Laredo); the full matrix only after a finished one.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "./desk.routes.js";
import { emptyTally, importRecords, importRecordSchema } from "./contacts.import.js";
import { googleKey, GoogleProspectsNotConfigured, PERFUME_PROSPECT_FIELD_MASK } from "./google-prospects.js";
import {
  batchPlan, batchRunning, contactCounts, contactFacets, FIRST_RUN_CITY, getContact, listContacts, listRuns, singleSearch, startBatch, stopBatch,
} from "./contacts.service.js";

async function ownerOnly(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  if (!requireAuth(req, reply)) return null;
  if (String(req.user?.role ?? "") !== "Owner") { void reply.code(403).send({ error: "owner_only" }); return null; }
  const uid = req.user!.uuid;
  if (!(await deskAllowed(uid))) { void reply.code(403).send({ error: "perfume_desk_not_granted" }); return null; }
  return uid;
}

const RL_READ = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as const;
const RL_SEARCH = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } } as const;
const listSchema = z.object({
  role: z.enum(["vendor", "customer", "both", "none", "all"]).optional(),
  q: z.string().max(200).optional(),
  source: z.string().max(120).optional(),
  country: z.string().max(60).optional(),
  // Several values per box, "|"-separated (a city name can hold a comma).
  countries: z.string().max(4000).optional(), states: z.string().max(4000).optional(), cities: z.string().max(8000).optional(),
  categories: z.string().max(4000).optional(), sources: z.string().max(2000).optional(), hows: z.string().max(2000).optional(),
  regions: z.string().max(4000).optional(), ctypes: z.string().max(4000).optional(), vtypes: z.string().max(2000).optional(),
  segments: z.string().max(4000).optional(), statuses: z.string().max(400).optional(), shows: z.string().max(8000).optional(), reach: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
const searchSchema = z.object({
  query: z.string().trim().min(2).max(120),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  country: z.string().trim().max(60).optional(),
  max: z.number().int().min(1).max(60).optional(),
});
const runSchema = z.object({ city: z.string().trim().max(160) });
const importSchema = z.object({ records: z.array(importRecordSchema).min(1).max(500) });
const RL_IMPORT = { bodyLimit: 8 * 1024 * 1024, config: { rateLimit: { max: 120, timeWindow: "1 minute" } } } as const;

export async function registerPerfumeContactsRoutes(app: FastifyInstance) {
  app.get("/api/v1/perfume/contacts", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = listSchema.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query", details: q.error.flatten() });
    const many = (v?: string) => (v ? v.split("|").map((x) => x.trim()).filter(Boolean).slice(0, 300) : undefined);
    const query = { ...q.data, countries: many(q.data.countries), states: many(q.data.states), cities: many(q.data.cities),
      categories: many(q.data.categories), sources: many(q.data.sources), hows: many(q.data.hows), regions: many(q.data.regions),
      ctypes: many(q.data.ctypes), vtypes: many(q.data.vtypes), segments: many(q.data.segments), statuses: many(q.data.statuses),
      shows: many(q.data.shows), reach: many(q.data.reach) };
    return withCurrentUser(uid, async (c) => ({ counts: await contactCounts(c), facets: await contactFacets(c, query), ...(await listContacts(c, query)) }));
  });

  app.get("/api/v1/perfume/contacts/:id", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = z.string().uuid().safeParse((req.params as { id?: string }).id);
    if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const out = await withCurrentUser(uid, (c) => getContact(c, id.data));
    if (!out) return reply.code(404).send({ error: "not_found" });
    return out;
  });

  // The Master Database and the INEGI DENUE pull, sent from the Contacts tab in batches of up to 500 (one transaction each).
  app.post("/api/v1/perfume/contacts/import", RL_IMPORT, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const body = importSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "invalid_records", details: body.error.issues.slice(0, 5) });
    return withCurrentUser(uid, (c) => importRecords(c, body.data.records, uid, emptyTally()));
  });

  app.get("/api/v1/perfume/prospects/google-plan", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const runs = await withCurrentUser(uid, (c) => listRuns(c));
    const firstDone = runs.some((r) => r["kind"] === "batch" && r["status"] === "done");
    return { configured: googleKey() != null, field_mask: PERFUME_PROSPECT_FIELD_MASK, running: batchRunning(), full_matrix_unlocked: firstDone, ...batchPlan(), runs };
  });

  app.post("/api/v1/perfume/prospects/google-search", RL_SEARCH, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const body = searchSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
    try {
      return await singleSearch(uid, body.data);
    } catch (e) {
      if (e instanceof GoogleProspectsNotConfigured) return reply.code(503).send({ error: "google_places_key_missing" });
      req.log.error({ err: (e as Error).message }, "perfume google search failed");
      return reply.code(502).send({ error: "google_search_failed", message: (e as Error).message });
    }
  });

  app.post("/api/v1/perfume/prospects/google-run", RL_SEARCH, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const body = runSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
    if (!googleKey()) return reply.code(503).send({ error: "google_places_key_missing" });
    if (body.data.city === "all") {
      const runs = await withCurrentUser(uid, (c) => listRuns(c));
      if (!runs.some((r) => r["kind"] === "batch" && r["status"] === "done")) {
        return reply.code(409).send({ error: "first_city_first", message: `Run ${FIRST_RUN_CITY} first and look at its result.` });
      }
    }
    try {
      const id = await startBatch(uid, { city: body.data.city });
      return { run_id: id };
    } catch (e) {
      const m = (e as Error).message;
      if (m === "google_batch_already_running") return reply.code(409).send({ error: m });
      if (m === "google_batch_unknown_city") return reply.code(400).send({ error: m });
      throw e;
    }
  });

  app.post("/api/v1/perfume/prospects/google-run/:id/stop", RL_SEARCH, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = String((req.params as { id?: string }).id ?? "");
    return { stopping: stopBatch(id) };
  });
}
