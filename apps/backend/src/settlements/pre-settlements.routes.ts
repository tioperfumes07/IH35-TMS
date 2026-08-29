import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { requireAuth } from "../auth/session-middleware.js";

const ALLOWED_ROLES = ["Owner", "Administrator", "Manager", "Accountant"];

function authGuard(req: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) {
  if (!requireAuth(req, reply)) return false;
  const role = String(req.user?.role ?? "");
  if (!ALLOWED_ROLES.includes(role)) {
    reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

// CHAIN-07 — the list-query schema for the retired `GET /api/v1/settlements` handler was removed with
// that handler (it now 308-redirects to the canonical driver-finance settlements subledger and no
// longer parses/queries the RETIRE settlement.* ledger). Archived here for history; do not restore a
// second settlement list ledger.

const idParamsSchema = z.object({ id: z.string().uuid() });

const pendingDedQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id:            z.string().uuid(),
  limit:                z.coerce.number().int().min(1).max(200).default(50),
  offset:               z.coerce.number().int().min(0).default(0),
});

export async function registerPreSettlementsRoutes(app: FastifyInstance) {

  /**
   * GET /api/v1/settlements — RETIRED (CHAIN-07, 2026-07-12).
   *
   * This legacy list handler queried the RETIRE `settlement.settlement` duplicate ledger, which no
   * longer exists on prod and returned a 500. It has been archived (kept for history, never deleted)
   * and now permanently redirects (308) to the single canonical driver-finance settlements subledger
   * at `/api/v1/driver-finance/settlements`. Single-subledger rule (QBO/NetSuite/McLeod/Alvys): NEVER
   * resurrect a 2nd settlement ledger. This handler MUST NOT read/write `settlement.*` / `payroll.*`.
   * Guarded by scripts/verify-chain07-settlements-redirect.mjs.
   *
   * ── Archived original implementation (do NOT re-enable — RETIRE schema) ──────────────────────────
   *   SELECT ... FROM settlement.settlement s JOIN mdata.drivers d ON d.id = s.driver_id ...
   *   (4 metric-card aggregates FROM settlement.settlement) — removed; caused the accounting
   *   "Settlements" surface 500. Canonical replacement: apps/backend/src/driver-finance/settlements.routes.ts
   * ────────────────────────────────────────────────────────────────────────────────────────────────
   */
  app.get("/api/v1/settlements", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const rawUrl = req.raw.url ?? "";
    const qs = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?")) : "";
    const canonical = `/api/v1/driver-finance/settlements${qs}`;
    reply.header("location", canonical);
    return reply.code(308).send({
      error: "gone",
      message: "The legacy settlements ledger is retired. Use the canonical driver-finance settlements subledger.",
      canonical_endpoint: canonical,
    });
  });

  /**
   * GET /api/v1/settlements/:id — RETIRED (CHAIN-07 extension, P2.4b 2026-07-15).
   *
   * The legacy detail handler queried the RETIRE `settlement.settlement` / `settlement.settlement_line`
   * / `settlement.settlement_deduction` duplicate ledger (empty on prod — verified 0 rows on branch
   * br-fancy-credit-akjnd07a — so it always 404'd). Nothing calls it: the only `/api/v1/settlements/:id/*`
   * consumer is the disputes sub-route. Like the retired LIST handler above, it now permanently
   * 308-redirects to the single canonical driver-finance settlement detail. Single-subledger rule
   * (QBO/NetSuite/McLeod/Alvys): NEVER resurrect a 2nd settlement ledger. MUST NOT read/write
   * `settlement.*` / `payroll.*`. Guarded by scripts/verify-chain07-settlements-redirect.mjs.
   */
  app.get("/api/v1/settlements/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const params = idParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "validation_error" });
    const rawUrl = req.raw.url ?? "";
    const qs = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?")) : "";
    const canonical = `/api/v1/driver-finance/settlements/${params.data.id}${qs}`;
    reply.header("location", canonical);
    return reply.code(308).send({
      error: "gone",
      message: "The legacy settlement detail is retired. Use the canonical driver-finance settlements subledger.",
      canonical_endpoint: canonical,
    });
  });

  /** GET /api/v1/settlements/pending-deductions — pending deductions for a driver */
  app.get("/api/v1/settlements/pending-deductions", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!authGuard(req, reply)) return;
    const parsed = pendingDedQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const p = parsed.data;

    const sql = `
      SELECT
        edp.source_type             AS deduction_type,
        edp.id::text                AS source_reference_id,
        'driver_finance.escrow_deductions_pending' AS source_table,
        edp.proposed_reason         AS description,
        edp.proposed_amount_cents   AS amount_cents,
        edp.proposed_at::text       AS created_at
      FROM driver_finance.escrow_deductions_pending edp
      WHERE edp.driver_id = $2::uuid
        AND edp.operating_company_id = $1::uuid
        AND edp.status = 'approved'
      ORDER BY edp.proposed_at ASC
      LIMIT $3 OFFSET $4`;

    return withCurrentUser(req.user!.uuid, async (client) => {
      await assertCompanyMembership(req.user!.uuid, p.operating_company_id);
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [p.operating_company_id]);
      const res = await client.query(sql, [p.operating_company_id, p.driver_id, p.limit, p.offset]);
      return { pending_deductions: res.rows, limit: p.limit, offset: p.offset };
    });
  });
}
