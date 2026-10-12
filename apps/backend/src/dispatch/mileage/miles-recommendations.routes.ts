// 443.55 — the Load screen's miles section: both recommendations (Historical + Google) per field, and the per-field choice.
//   GET  /api/v1/mdata/loads/:id/miles-recommendations   — booked load (stops + unit from the load)
//   POST /api/v1/mdata/miles-recommendations             — Book Load before booking (stops + unit from the form)
//   POST /api/v1/mdata/loads/:id/miles-choice            — choose ONE field's source (historical | google | manual + reason | document)
// The Google key stays on the server (googleLegMiles). Nothing here reads or writes driver pay.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import { withCurrentUser } from "../../auth/db.js";
import { resolveOperatingCompanyId } from "../../auth/operating-company-scope.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import {
  computeMilesRecommendations,
  MILES_FIELDS,
  MILES_SOURCES,
  MilesChoiceError,
  milesRecommendationsForLoad,
  setMilesChoice,
  fillLoadDeadhead,
  type DeadheadFillResult,
} from "./miles-recommendations.service.js";
import { decidePrintedTrailers } from "../printed-trailer-decision.service.js";
import { matchLoadTrailersByGps } from "../load-trailer-gps-match.service.js";
import { stampDriverBillTrailersFromLoads } from "../../accounting/bill-trailer-stamp.service.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { SamsaraClient } from "../../integrations/samsara/samsara-client.js";
import { resolveSamsaraApiToken } from "../../integrations/samsara/samsara-token.js";
import { getSamsaraConfigForCompany } from "../../integrations/samsara/samsara.service.js";
import { canonicalHappenedNotVoidedLoadClause } from "../canonical-active-load-set.js";

const READ_ROLES = new Set(["Owner", "Administrator", "Manager", "Dispatcher", "Accountant", "Safety"]);
const WRITE_ROLES = new Set(["Owner", "Administrator", "Manager", "Dispatcher"]);
const DEADHEAD_FILL_ROLES = new Set(["Owner", "Administrator"]);
const deadheadFillBody = z.object({
  operating_company_id: z.string().uuid(),
  dry_run: z.boolean().default(true),
  load_ids: z.array(z.string().uuid()).max(500).optional(),
});

const idParams = z.object({ id: z.string().uuid() });
const companyQuery = z.object({ operating_company_id: z.string().uuid().optional() });
const stopSchema = z.object({
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
});
const previewBody = z.object({
  operating_company_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().nullable().optional(),
  stops: z.array(stopSchema).min(1).max(30),
});
const choiceBody = z.object({
  field: z.enum(MILES_FIELDS),
  source: z.enum(MILES_SOURCES),
  manual_value: z.number().nonnegative().optional(),
  reason: z.string().max(500).optional(),
});

function authUser(req: FastifyRequest, reply: FastifyReply, roles: Set<string>) {
  if (!requireAuth(req, reply)) return null;
  const u = req.user as { uuid: string; role: string };
  if (!roles.has(u.role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return u;
}

async function scope(client: Parameters<Parameters<typeof withCurrentUser>[1]>[0], userId: string, requested?: string) {
  const companyId = await resolveOperatingCompanyId(client, userId, requested);
  if (!companyId) return null;
  await assertCompanyMembership(client, userId, companyId);
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
  return companyId;
}

export async function registerMilesRecommendationsRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/loads/:id/miles-recommendations", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const u = authUser(req, reply, READ_ROLES);
    if (!u) return reply;
    const p = idParams.safeParse(req.params ?? {});
    const q = companyQuery.safeParse(req.query ?? {});
    if (!p.success || !q.success) return reply.code(400).send({ error: "invalid_request" });
    const out = await withCurrentUser(u.uuid, async (client) => {
      const companyId = await scope(client, u.uuid, q.data.operating_company_id);
      if (!companyId) return null;
      return milesRecommendationsForLoad(client as never, { operatingCompanyId: companyId, loadId: p.data.id });
    });
    if (!out) return reply.code(404).send({ error: "load_not_found" });
    return out;
  });

  app.post("/api/v1/mdata/miles-recommendations", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const u = authUser(req, reply, WRITE_ROLES);
    if (!u) return reply;
    const b = previewBody.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "invalid_request", details: b.error.flatten() });
    const out = await withCurrentUser(u.uuid, async (client) => {
      const companyId = await scope(client, u.uuid, b.data.operating_company_id);
      if (!companyId) return null;
      return computeMilesRecommendations(client as never, {
        operatingCompanyId: companyId,
        unitId: b.data.unit_id ?? null,
        stops: b.data.stops.map((s) => ({ latitude: s.latitude, longitude: s.longitude, city: s.city ?? null, state: s.state ?? null, postal_code: s.postal_code ?? null })),
      });
    });
    if (!out) return reply.code(400).send({ error: "operating_company_required" });
    return out;
  });

  app.post("/api/v1/mdata/loads/:id/miles-choice", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const u = authUser(req, reply, WRITE_ROLES);
    if (!u) return reply;
    const p = idParams.safeParse(req.params ?? {});
    const q = companyQuery.safeParse(req.query ?? {});
    const b = choiceBody.safeParse(req.body ?? {});
    if (!p.success || !q.success || !b.success) return reply.code(400).send({ error: "invalid_request" });
    if (b.data.source === "manual" && (!b.data.reason?.trim() || b.data.manual_value == null))
      return reply.code(400).send({ error: "manual_miles_requires_value_and_reason" });
    try {
      const out = await withCurrentUser(u.uuid, async (client) => {
        const companyId = await scope(client, u.uuid, q.data.operating_company_id);
        if (!companyId) return null;
        return setMilesChoice(client as never, {
          operatingCompanyId: companyId,
          loadId: p.data.id,
          field: b.data.field,
          source: b.data.source,
          manualValue: b.data.manual_value ?? null,
          reason: b.data.reason ?? null,
          actorUserId: u.uuid,
        });
      });
      if (!out) return reply.code(404).send({ error: "load_not_found" });
      return out;
    } catch (e) {
      if (e instanceof MilesChoiceError) return reply.code(e.code === "load_not_found" ? 404 : 409).send({ error: e.code });
      throw e;
    }
  });

  // RULING 443.86 #1 — fill every live load's NULL deadhead through the one engine (fillLoadDeadhead): the previous load's
  // last stop -> first pickup, else the truck's Samsara position at dispatch, else listed with the reason. Owner /
  // Administrator; dry_run computes inside a savepoint and rolls back. Runs server side, where the Google key lives.
  app.post("/api/v1/mdata/loads/deadhead-fill", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const u = authUser(req, reply, DEADHEAD_FILL_ROLES);
    if (!u) return reply;
    const b = deadheadFillBody.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "invalid_request" });
    const out = await withCurrentUser(u.uuid, async (client) => {
      const companyId = await scope(client, u.uuid, b.data.operating_company_id);
      if (!companyId) return null;
      const ids = (
        await client.query<{ id: string }>(
          `SELECT l.id::text FROM mdata.loads l
            WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL AND l.voided_at IS NULL AND l.miles_deadhead IS NULL
              AND ${canonicalHappenedNotVoidedLoadClause("l")}
              AND ($2::uuid[] IS NULL OR l.id = ANY($2::uuid[]))
            ORDER BY l.load_number`,
          [companyId, b.data.load_ids ?? null]
        )
      ).rows.map((r) => r.id);
      await client.query("SAVEPOINT deadhead_fill");
      const results: DeadheadFillResult[] = [];
      for (const id of ids) results.push(await fillLoadDeadhead(client as never, { operatingCompanyId: companyId, loadId: id, actorUserId: u.uuid }));
      if (b.data.dry_run) await client.query("ROLLBACK TO SAVEPOINT deadhead_fill");
      else await client.query("RELEASE SAVEPOINT deadhead_fill");
      const count = (st: string, m?: string) => results.filter((r) => r.status === st && (!m || r.method === m)).length;
      return {
        dry_run: b.data.dry_run, loads: results.length,
        filled_prev_stop: count("filled", "google_practical_prev_stop"), filled_samsara_position: count("filled", "google_practical_samsara_position"),
        not_filled: results.filter((r) => r.status === "not_filled").map((r) => `${r.load_number}: ${r.reason}`),
        filled: results.filter((r) => r.status === "filled").map((r) => `${r.load_number} ${r.miles} (${r.method})`),
      };
    });
    if (!out) return reply.code(404).send({ error: "company_not_found" });
    return out;
  });

  // LEAD 443.107 item 2 (owner: GPS is the source of truth) — each load with no physical trailer gets the fleet trailer
  // whose Samsara GPS stayed with its truck from pickup to delivery; one clear match -> recorded on the load (assignment
  // history), its expenses and (through the Owner bill stamp) its driver bills. Metadata only. Owner only; a refusal is
  // audited. dry_run (default) returns every load's decision + candidate scores and writes nothing.
  app.post("/api/v1/dispatch/loads/trailers-from-gps", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const u = req.user as { uuid: string; role: string };
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    const b = z.object({ dry_run: z.boolean().default(true), load_ids: z.array(z.string().uuid()).max(500).optional() }).safeParse(req.body ?? {});
    if (!q.success || !b.success) return reply.code(400).send({ error: "invalid_request" });
    const out = await withCurrentUser(u.uuid, async (client) => {
      const companyId = await scope(client, u.uuid, q.data.operating_company_id);
      if (!companyId) return { status: 404 as const };
      if (u.role !== "Owner") {
        await appendCrudAudit(client as never, u.uuid, "load.trailer_gps_match_refused_non_owner",
          { resource_type: "mdata.loads", operating_company_id: companyId, role: u.role ?? null }, "warning", "LEAD-443.107-OWNER-ONLY");
        return { status: 403 as const };
      }
      const cfg = await getSamsaraConfigForCompany(client as never, companyId);
      const api = new SamsaraClient({ apiToken: resolveSamsaraApiToken(cfg as Record<string, unknown>), samsaraOrgId: cfg?.samsara_org_id ? String(cfg.samsara_org_id) : null });
      const loads = await matchLoadTrailersByGps(client as never, {
        operatingCompanyId: companyId, actorUserId: u.uuid, dryRun: b.data.dry_run, loadIds: b.data.load_ids,
        fetchTrailerGps: (ids, start, end) => api.trailerGpsHistory(ids, start, end),
      });
      const bills = b.data.dry_run || loads.stamped_loads === 0
        ? null
        : await stampDriverBillTrailersFromLoads(client as never, { operatingCompanyId: companyId, actorUserId: u.uuid, actorRole: "Owner", dryRun: false });
      return { status: 200 as const, body: { ...loads, driver_bill_stamp: bills && { bills_changed: bills.bills_changed, header_stamps: bills.header_stamps, line_stamps: bills.line_stamps, refused_bills: bills.refused_bills } } };
    });
    if (out.status === 404) return reply.code(404).send({ error: "company_not_found" });
    if (out.status === 403) return reply.code(403).send({ error: "owner_only", message: "Only the Owner can record trailers from GPS." });
    return out.body;
  });

  // RULING 443.90 #4 — every printed trailer number gets a decision (company equipment / Samsara unmapped / customer trailer).
  app.post("/api/v1/mdata/loads/printed-trailer-decide", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (req, reply) => {
    const u = authUser(req, reply, DEADHEAD_FILL_ROLES);
    if (!u) return reply;
    const b = z.object({ operating_company_id: z.string().uuid(), dry_run: z.boolean().default(true) }).safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "invalid_request" });
    const out = await withCurrentUser(u.uuid, async (client) => {
      const companyId = await scope(client, u.uuid, b.data.operating_company_id);
      if (!companyId) return null;
      await client.query("SAVEPOINT printed_trailer");
      const decisions = await decidePrintedTrailers(client as never, { operatingCompanyId: companyId, actorUserId: u.uuid });
      if (b.data.dry_run) await client.query("ROLLBACK TO SAVEPOINT printed_trailer");
      else await client.query("RELEASE SAVEPOINT printed_trailer");
      return { dry_run: b.data.dry_run, decisions };
    });
    if (!out) return reply.code(404).send({ error: "company_not_found" });
    return out;
  });
}
