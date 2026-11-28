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
import { applyNameFixes, applyNameFixesSchema, previewNameFixes } from "./company-names.service.js";
import { deleteContacts, deleteContactsSchema, restoreContacts } from "./contact-delete.service.js";
import { approveCompanies, approveSchema, unapproveCompanies, unapproveSchema } from "./lead-approval.service.js";
import { findContactInfo, findContactInfoSchema, unreachableCounts } from "./contact-enrich.service.js";
import { companyLocations, duplicateGroups, mergeCompanies, mergeDuplicateGroups, mergeOneSchema, mergeSchema } from "./company-merge.service.js";
import { confirmDuplicates, decideSchema, dismissDuplicates, listRecommendations, scanDuplicates } from "./duplicate-detector.service.js";
import { vendorRanking } from "../scentsx/vendor-ranking.service.js";
import { assignBody, assignSalesperson, companySalesperson, createSalesperson, listSalespeople, salesBySalesperson, salespersonBody, salespersonCustomers, salespersonPatch,
  SalespersonInvalid, salesRepQuery, updateSalesperson } from "./salespeople.service.js";
import { companyTier, customerRanking, historyImportSchema, importPurchaseHistory, rankingQuery, relinkPurchaseHistory } from "./customer-ranking.service.js";

async function ownerOnly(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  if (!requireAuth(req, reply)) return null;
  if (String(req.user?.role ?? "") !== "Owner") { void reply.code(403).send({ error: "owner_only" }); return null; }
  const uid = req.user!.uuid;
  if (!(await deskAllowed(uid))) { void reply.code(403).send({ error: "perfume_desk_not_granted" }); return null; }
  return uid;
}

const RL_READ = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as const;
const RL_SEARCH = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } } as const;
const RL_WRITE_ONE = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } } as const;
export const listSchema = z.object({
  role: z.enum(["vendor", "customer", "both", "none", "all"]).optional(),
  // Owner 2026-11-28 14:30 CT: Leads = not approved yet; Customers / Vendors = approved only.
  stage: z.enum(["lead", "approved", "all"]).optional(),
  q: z.string().max(200).optional(),
  source: z.string().max(120).optional(),
  country: z.string().max(60).optional(),
  // Several values per box, "|"-separated (a city name can hold a comma).
  countries: z.string().max(4000).optional(), states: z.string().max(4000).optional(), cities: z.string().max(8000).optional(),
  categories: z.string().max(4000).optional(), sources: z.string().max(2000).optional(), hows: z.string().max(2000).optional(),
  regions: z.string().max(4000).optional(), ctypes: z.string().max(4000).optional(), vtypes: z.string().max(2000).optional(),
  segments: z.string().max(4000).optional(), statuses: z.string().max(400).optional(), shows: z.string().max(8000).optional(), reach: z.string().max(200).optional(),
  kinds: z.string().max(2000).optional(),
  relationships: z.string().max(2000).optional(), industries: z.string().max(2000).optional(), tags: z.string().max(4000).optional(),
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

/** The list query with every "|"-separated box split into its values (the list and the Excel download read the same filters). */
export function contactQueryFrom(d: z.infer<typeof listSchema>) {
  const many = (v?: string) => (v ? v.split("|").map((x) => x.trim()).filter(Boolean).slice(0, 300) : undefined);
  return { ...d, countries: many(d.countries), states: many(d.states), cities: many(d.cities),
    categories: many(d.categories), sources: many(d.sources), hows: many(d.hows), regions: many(d.regions),
    ctypes: many(d.ctypes), vtypes: many(d.vtypes), segments: many(d.segments), statuses: many(d.statuses),
    shows: many(d.shows), reach: many(d.reach), kinds: many(d.kinds),
    relationships: many(d.relationships), industries: many(d.industries), tags: many(d.tags) };
}

export async function registerPerfumeContactsRoutes(app: FastifyInstance) {
  app.get("/api/v1/perfume/contacts", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = listSchema.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query", details: q.error.flatten() });
    const query = contactQueryFrom(q.data);
    return withCurrentUser(uid, async (c) => ({ counts: await contactCounts(c), facets: await contactFacets(c, query), ...(await listContacts(c, query)) }));
  });

  // ROUND L.31 M18 E3 — salespeople, a customer's salesperson (with history), sales / commission by salesperson (read only).
  const spFail = (reply: FastifyReply, e: unknown) => { if (e instanceof SalespersonInvalid) return reply.code(400).send({ error: "invalid", message: e.message }); throw e; };
  app.get("/api/v1/perfume/salespeople", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, async (c) => ({ salespeople: await listSalespeople(c) }));
  });
  app.post("/api/v1/perfume/salespeople", RL_WRITE_ONE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = salespersonBody.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "invalid", issues: b.error.issues });
    try { return reply.code(201).send(await withCurrentUser(uid, (c) => createSalesperson(c, uid, b.data))); } catch (e) { return spFail(reply, e); }
  });
  app.patch("/api/v1/perfume/salespeople/:id", RL_WRITE_ONE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = z.string().uuid().safeParse((req.params as { id?: string }).id); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const b = salespersonPatch.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "invalid", issues: b.error.issues });
    try { return await withCurrentUser(uid, (c) => updateSalesperson(c, id.data, b.data)); } catch (e) { return spFail(reply, e); }
  });
  app.post("/api/v1/perfume/salespeople/assign", RL_WRITE_ONE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = assignBody.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "invalid", issues: b.error.issues });
    try { return await withCurrentUser(uid, (c) => assignSalesperson(c, uid, b.data)); } catch (e) { return spFail(reply, e); }
  });
  app.get("/api/v1/perfume/companies/:id/salesperson", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = z.string().uuid().safeParse((req.params as { id?: string }).id); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    return withCurrentUser(uid, (c) => companySalesperson(c, id.data));
  });
  app.get("/api/v1/perfume/salespeople/report", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = salesRepQuery.safeParse(req.query ?? {}); if (!q.success) return reply.code(400).send({ error: "invalid", issues: q.error.issues });
    return withCurrentUser(uid, (c) => salesBySalesperson(c, q.data));
  });
  app.get("/api/v1/perfume/salespeople/report/customers", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const raw = req.query as { salesperson_id?: string };
    const sp = raw.salesperson_id && raw.salesperson_id !== "unassigned" ? z.string().uuid().safeParse(raw.salesperson_id) : { success: true as const, data: null };
    if (!sp.success) return reply.code(400).send({ error: "invalid_salesperson" });
    const q = salesRepQuery.safeParse(req.query ?? {}); if (!q.success) return reply.code(400).send({ error: "invalid", issues: q.error.issues });
    return withCurrentUser(uid, async (c) => ({ customers: await salespersonCustomers(c, sp.data, q.data) }));
  });
  // ROUND P1.31 L1 (owner 15:45 CT item 10): customer ranking A/B/C on purchases (history import has no balances — owner 14:12 CT).
  app.get("/api/v1/perfume/customers/ranking", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = rankingQuery.safeParse(req.query ?? {}); if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    return withCurrentUser(uid, (c) => customerRanking(c, q.data));
  });
  // ROUND L.31 M27: vendor ranking — ScentsX bills per vendor (the books), then POs ordered / received, ABC on billed. Read only.
  app.get("/api/v1/perfume/vendors/ranking", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, (c) => vendorRanking(c));
  });
  // LEAD item 23: re-link the purchase history to companies after customers are imported or merged (owner presses it on Ranking).
  app.post("/api/v1/perfume/customers/purchase-history/relink", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, (c) => relinkPurchaseHistory(c));
  });
  app.post("/api/v1/perfume/customers/purchase-history/import", { config: { rateLimit: { max: 30, timeWindow: "1 minute" }, bodyLimit: 8 * 1024 * 1024 } }, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = historyImportSchema.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "validation_error", message: b.error.issues[0]?.message });
    return withCurrentUser(uid, (c) => importPurchaseHistory(c, uid, b.data.rows));
  });
  app.get("/api/v1/perfume/contacts/:id/tier", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = z.string().uuid().safeParse((req.params as { id?: string }).id); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    return withCurrentUser(uid, (c) => companyTier(c, id.data));
  });
  // Owner 2026-11-27 21:39 CT: delete the selected contacts that are not for the business (companies with business on file are kept).
  app.post("/api/v1/perfume/contacts/delete", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = deleteContactsSchema.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "validation_error" });
    return withCurrentUser(uid, async (c) => { const r = await deleteContacts(c, uid, b.data.ids); await scanDuplicates(c); return r; });
  });
  // Owner 2026-11-28 14:30 CT: leads become customers / vendors only when approved; "Send back to leads" undoes it.
  app.post("/api/v1/perfume/contacts/approve", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = approveSchema.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "validation_error" });
    return withCurrentUser(uid, (c) => approveCompanies(c, uid, b.data.ids, b.data.role));
  });
  app.post("/api/v1/perfume/contacts/unapprove", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = unapproveSchema.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "validation_error" });
    return withCurrentUser(uid, (c) => unapproveCompanies(c, uid, b.data.ids));
  });
  // Owner 2026-11-28 14:24–14:26 CT: a lead with no email or phone — find its contact info (Google Places + its own website).
  app.get("/api/v1/perfume/contacts/no-contact-info", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, async (c) => ({ configured: googleKey() != null, ...(await unreachableCounts(c)) }));
  });
  app.post("/api/v1/perfume/contacts/find-contact-info", RL_SEARCH, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = findContactInfoSchema.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "validation_error" });
    if (!googleKey()) return reply.code(503).send({ error: "google_places_key_missing" });
    try { return await findContactInfo((fn) => withCurrentUser(uid, (c) => fn(c)), uid, b.data); }
    catch (e) {
      if (e instanceof GoogleProspectsNotConfigured) return reply.code(503).send({ error: "google_places_key_missing" });
      req.log.error({ err: (e as Error).message }, "perfume find contact info failed");
      return reply.code(502).send({ error: "find_contact_info_failed", message: (e as Error).message });
    }
  });
  app.post("/api/v1/perfume/contacts/restore", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = deleteContactsSchema.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "validation_error" });
    return withCurrentUser(uid, (c) => restoreContacts(c, uid, b.data.ids));
  });
  // Owner 16:32 CT: one company, many contacts — duplicate companies merged into one (the others kept as its locations).
  app.get("/api/v1/perfume/contacts/duplicates", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, async (c) => { const groups = await duplicateGroups(c); return { groups: groups.length, extra: groups.reduce((s, g) => s + g.merge.length, 0), rows: groups }; });
  });
  app.post("/api/v1/perfume/contacts/duplicates/merge", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = mergeSchema.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "validation_error" });
    return withCurrentUser(uid, async (c) => { const r = await mergeDuplicateGroups(c, uid, b.data.keys); await scanDuplicates(c); return r; });
  });
  // Owner 17:25 CT: click a duplicate company → pop-up with every record of it → pick the one that stays → Confirm.
  app.post("/api/v1/perfume/contacts/duplicates/merge-one", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = mergeOneSchema.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "validation_error" });
    return withCurrentUser(uid, async (c) => {
      const merged = await mergeCompanies(c, uid, b.data.keep, b.data.ids, "duplicate companies: owner confirmed in the pop-up");
      await scanDuplicates(c); return { merged };
    });
  });
  // Owner 17:17 CT: automatic duplicate detector — recommendations (same / similar name, phone, domain, address); the owner confirms.
  app.get("/api/v1/perfume/contacts/duplicate-recommendations", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    // The scan already runs after every import / Excel update / merge; on open it re-runs only when the last scan is over 60 minutes
    // old (measured 2026-11-27: a full scan of 3,810 live companies took 19.5 s in the owner's browser).
    return withCurrentUser(uid, async (c) => {
      const stale = (await c.query<{ stale: boolean }>(
        `SELECT coalesce(max(last_seen_at) < now() - interval '60 minutes', true) AS stale FROM perfume.duplicate_candidates`)).rows[0]!.stale;
      const scan = stale ? await scanDuplicates(c) : null;
      return { ...(await listRecommendations(c)), found: scan?.found ?? null, scanned: stale };
    });
  });
  app.post("/api/v1/perfume/contacts/duplicate-recommendations/confirm", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = decideSchema.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "validation_error" });
    return withCurrentUser(uid, (c) => confirmDuplicates(c, uid, b.data.ids, b.data.keep ?? {}));
  });
  app.post("/api/v1/perfume/contacts/duplicate-recommendations/dismiss", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = decideSchema.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "validation_error" });
    return withCurrentUser(uid, (c) => dismissDuplicates(c, uid, b.data.ids));
  });
  app.get("/api/v1/perfume/contacts/:id/locations", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = z.string().uuid().safeParse((req.params as { id?: string }).id); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    return withCurrentUser(uid, async (c) => ({ locations: await companyLocations(c, id.data) }));
  });
  // ROUND P1.31 L2 (owner 15:47 CT): company names in proper format — preview, then Apply (one history row per rename).
  app.get("/api/v1/perfume/contacts/name-format/preview", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, async (c) => { const fixes = await previewNameFixes(c); return { count: fixes.length, fixes }; });
  });
  app.post("/api/v1/perfume/contacts/name-format/apply", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = applyNameFixesSchema.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "validation_error" });
    return withCurrentUser(uid, (c) => applyNameFixes(c, uid, b.data.ids));
  });
  app.get("/api/v1/perfume/contacts/:id", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = z.string().uuid().safeParse((req.params as { id?: string }).id);
    if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const out = await withCurrentUser(uid, (c) => getContact(c, id.data));
    if (!out) return reply.code(404).send({ error: "not_found" });
    return out;
  });

  // Owner 2026-11-27 18:21 CT: "we are missing create vendor create customer, and the correct pop up and profile creator". One company
  // through the same import engine (match key / phone / domain → never a second record for a company already on file); returns its id
  // and whether it already existed, so the pop-up opens the profile either way.
  app.post("/api/v1/perfume/contacts/create", RL_WRITE_ONE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = importRecordSchema.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "validation_error", details: b.error.issues.slice(0, 5) });
    return withCurrentUser(uid, async (c) => {
      let id: string | null = null, inserted = false;
      await importRecords(c, [b.data], uid, emptyTally(), (cid, ins) => { id = cid; inserted = ins; });
      // A customer / vendor the owner creates by hand is approved at once (owner 2026-11-28 14:30 CT) — imports stay leads.
      const role = (b.data as { company?: { role?: string | null } }).company?.role;
      if (id && (role === "customer" || role === "vendor" || role === "both")) await approveCompanies(c, uid, [id], role);
      await scanDuplicates(c);
      return { id, existed: !inserted };
    });
  });

  // The Master Database and the INEGI DENUE pull, sent from the Contacts tab in batches of up to 500 (one transaction each).
  app.post("/api/v1/perfume/contacts/import", RL_IMPORT, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const body = importSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "invalid_records", details: body.error.issues.slice(0, 5) });
    // The duplicate detector runs after every import (owner 17:17 CT): new companies are checked against what is already on file.
    return withCurrentUser(uid, async (c) => { const t = await importRecords(c, body.data.records, uid, emptyTally()); await scanDuplicates(c); return t; });
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
