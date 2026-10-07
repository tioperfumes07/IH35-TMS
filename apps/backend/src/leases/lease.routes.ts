import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import {
  BILLING_MODES,
  LEASE_TYPES,
  LeaseEngineError,
  closeLease,
  createLeaseAgreement,
  getLease,
  leasesForAsset,
  listLeases,
  refuseNonOwner,
  signLease,
} from "./lease-engine.service.js";
import { currentPeriodStartCT, generateLeaseBills } from "./lease-bill-engine.service.js";
import { buyOutLeaseToOwn } from "./lease-buyout.service.js";
import { LesseePostingError } from "./lessee-posting.service.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };
const READ_ROLES = new Set(["Owner", "Administrator", "Manager", "Accountant"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const company = z.object({ operating_company_id: z.string().uuid() });
const idParam = z.object({ id: z.string().uuid() });
const createBody = company.extend({
  lease_type: z.enum(LEASE_TYPES),
  billing_mode: z.enum(BILLING_MODES),
  lessor_operating_company_id: z.string().uuid(),
  lessor_vendor_id: z.string().uuid(),
  commencement_date: date,
  end_date: date,
  deposit_cents: z.number().int().nonnegative().nullable().optional(),
  escalation_pct_bps: z.number().int().nonnegative().nullable().optional(),
  escalation_every_months: z.number().int().positive().nullable().optional(),
  // ROUND 321 lease-to-own (ASC 842 lessee): required for lease_to_own by validateAgreement.
  discount_rate_bps: z.number().int().min(0).max(10000).nullable().optional(),
  purchase_option_kind: z.enum(["none", "fmv", "fixed"]).nullable().optional(),
  purchase_option_price_cents: z.number().int().min(0).nullable().optional(),
  election: z.enum(["operating", "sales_type"]).optional(),
  expense_account_id: z.string().uuid().nullable().optional(),
  display_id: z.string().trim().max(60).nullable().optional(),
  contract_instance_id: z.string().uuid().nullable().optional(),
  assets: z.array(z.object({
    unit_id: z.string().uuid().nullable().optional(),
    equipment_id: z.string().uuid().nullable().optional(),
    monthly_amount_cents: z.number().int().nonnegative(),
    start_date: date.nullable().optional(),
  })).min(1).max(200),
});
const signBody = company.extend({ signed_at: z.string().min(10), contract_instance_id: z.string().uuid().nullable().optional() });
const closeBody = company.extend({ closed_on: date, reason: z.string().trim().min(3).max(500) });
const buyoutBody = company.extend({ buyout_date: date, price_cents: z.number().int().min(0).nullable().optional() });
const generateBody = company.extend({ period_start: z.string().regex(/^\d{4}-\d{2}-01$/).optional(), lease_id: z.string().uuid().optional() });
const assetQuery = company.extend({ unit_id: z.string().uuid().optional(), equipment_id: z.string().uuid().optional() });

function sendErr(reply: FastifyReply, e: unknown) {
  if (e instanceof LeaseEngineError) return reply.code(e.status).send({ error: e.code, message: e.message });
  if (e instanceof LesseePostingError) return reply.code(e.status).send({ error: e.code, message: e.message });
  throw e;
}

/** Months from a lease's commencement through the current month (catch-up for backdated contracts). */
export function monthsToBill(commencement: string, currentPeriod: string): string[] {
  const out: string[] = [];
  let [y, m] = commencement.split("-").map(Number);
  const [cy, cm] = currentPeriod.split("-").map(Number);
  while (y < cy || (y === cy && m <= cm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    if (out.length > 240) break;
  }
  return out;
}

export async function registerLeaseRoutes(app: FastifyInstance) {
  const authed = async (req: FastifyRequest, reply: FastifyReply, opco: string) => {
    if (!requireAuth(req, reply)) return null;
    const user = req.user;
    if (!user) return null;
    await assertCompanyMembership(user.uuid, opco);
    return user as { uuid: string; role?: string | null };
  };

  app.get("/api/v1/leases", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const q = company.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    const user = await authed(req, reply, q.data.operating_company_id);
    if (!user) return;
    if (!READ_ROLES.has(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    return withCurrentUser(user.uuid, async (client) => {
        // membership-scope-exempt: caller operating_company_id validated by assertCompanyMembership above.
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [q.data.operating_company_id]);
      return { leases: await listLeases(client as DbClient, q.data.operating_company_id) };
    });
  });

  app.get("/api/v1/leases/by-asset", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const q = assetQuery.safeParse(req.query ?? {});
    if (!q.success || [q.data.unit_id, q.data.equipment_id].filter(Boolean).length !== 1) return reply.code(400).send({ error: "validation_error", message: "pass exactly one of unit_id / equipment_id" });
    const user = await authed(req, reply, q.data.operating_company_id);
    if (!user) return;
    return withCurrentUser(user.uuid, async (client) => {
        // membership-scope-exempt: caller operating_company_id validated by assertCompanyMembership above.
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [q.data.operating_company_id]);
      return leasesForAsset(client as DbClient, q.data.operating_company_id, { unitId: q.data.unit_id, equipmentId: q.data.equipment_id });
    });
  });

  app.get("/api/v1/leases/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const p = idParam.safeParse(req.params ?? {});
    const q = company.safeParse(req.query ?? {});
    if (!p.success || !q.success) return reply.code(400).send({ error: "validation_error" });
    const user = await authed(req, reply, q.data.operating_company_id);
    if (!user) return;
    const out = await withCurrentUser(user.uuid, async (client) => {
        // membership-scope-exempt: caller operating_company_id validated by assertCompanyMembership above.
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [q.data.operating_company_id]);
      return getLease(client as DbClient, q.data.operating_company_id, p.data.id);
    });
    if (!out) return reply.code(404).send({ error: "lease_not_found" });
    return out;
  });

  app.post("/api/v1/leases", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const b = createBody.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "validation_error", details: b.error.flatten() });
    const user = await authed(req, reply, b.data.operating_company_id);
    if (!user) return;
    try {
      return await withCurrentUser(user.uuid, async (client) => {
        // membership-scope-exempt: caller operating_company_id validated by assertCompanyMembership above.
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [b.data.operating_company_id]);
        await refuseNonOwner(client as DbClient, user, "create", b.data.operating_company_id);
        const { operating_company_id, ...input } = b.data;
        return createLeaseAgreement(client as DbClient, operating_company_id, user.uuid, input);
      });
    } catch (e) { return sendErr(reply, e); }
  });

  app.post("/api/v1/leases/:id/sign", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const p = idParam.safeParse(req.params ?? {});
    const b = signBody.safeParse(req.body ?? {});
    if (!p.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    const user = await authed(req, reply, b.data.operating_company_id);
    if (!user) return;
    let commencement: string;
    try {
      commencement = await withCurrentUser(user.uuid, async (client) => {
        // membership-scope-exempt: caller operating_company_id validated by assertCompanyMembership above.
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [b.data.operating_company_id]);
        await refuseNonOwner(client as DbClient, user, "sign", b.data.operating_company_id);
        await signLease(client as DbClient, b.data.operating_company_id, user.uuid, p.data.id, b.data.signed_at, b.data.contract_instance_id ?? null);
        const r = await (client as DbClient).query<{ c: string }>(`SELECT commencement_date::text AS c FROM accounting.lease_contract WHERE id = $1::uuid`, [p.data.id]);
        return r.rows[0].c;
      });
    } catch (e) { return sendErr(reply, e); }
    // Backdated contract: bill every month from commencement through the current month (idempotent per key).
    const runs = [];
    for (const period of monthsToBill(commencement, currentPeriodStartCT())) {
      runs.push(await generateLeaseBills(b.data.operating_company_id, period, user.uuid, p.data.id));
    }
    return { signed: p.data.id, bills: runs };
  });

  app.post("/api/v1/leases/:id/close", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const p = idParam.safeParse(req.params ?? {});
    const b = closeBody.safeParse(req.body ?? {});
    if (!p.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    const user = await authed(req, reply, b.data.operating_company_id);
    if (!user) return;
    try {
      await withCurrentUser(user.uuid, async (client) => {
        // membership-scope-exempt: caller operating_company_id validated by assertCompanyMembership above.
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [b.data.operating_company_id]);
        await refuseNonOwner(client as DbClient, user, "close", b.data.operating_company_id);
        await closeLease(client as DbClient, b.data.operating_company_id, user.uuid, p.data.id, b.data.closed_on, b.data.reason);
      });
      return { closed: p.data.id };
    } catch (e) { return sendErr(reply, e); }
  });

  // ROUND 321: lease-to-own buyout close — Owner-only (same gate as create / sign / close): purchase bill to the lessor,
  // ROU -> owned fixed asset, title to the lessee, fixed-asset register, lease closed.
  app.post("/api/v1/leases/:id/buyout", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const p = idParam.safeParse(req.params ?? {});
    const b = buyoutBody.safeParse(req.body ?? {});
    if (!p.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    const user = await authed(req, reply, b.data.operating_company_id);
    if (!user) return;
    try {
      await withCurrentUser(user.uuid, async (client) => {
        // membership-scope-exempt: caller operating_company_id validated by assertCompanyMembership above.
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [b.data.operating_company_id]);
        await refuseNonOwner(client as DbClient, user, "buyout", b.data.operating_company_id);
      });
      return await buyOutLeaseToOwn(b.data.operating_company_id, user.uuid, p.data.id, { buyout_date: b.data.buyout_date, price_cents: b.data.price_cents ?? null });
    } catch (e) { return sendErr(reply, e); }
  });

  app.post("/api/v1/leases/bills/generate", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const b = generateBody.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "validation_error" });
    const user = await authed(req, reply, b.data.operating_company_id);
    if (!user) return;
    if (!["Owner", "Administrator", "Accountant"].includes(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    return generateLeaseBills(b.data.operating_company_id, b.data.period_start ?? currentPeriodStartCT(), user.uuid, b.data.lease_id);
  });
}
