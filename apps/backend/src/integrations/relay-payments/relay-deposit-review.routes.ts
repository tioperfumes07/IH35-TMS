/**
 * Relay deposit REVIEW QUEUE + owner-editable company-card map (Part B). DISPLAY + config ONLY — no
 * posting, no booking. See docs/trackers/RELAY-DEPOSIT-FUNDING-RECON-2026-07-12.md.
 *
 * GET  /api/integrations/relay/deposits?operating_company_id=<uuid>[&classification=unclassified]
 *        → deposits + per-classification/per-card summary (the owner-review queue).
 * GET  /api/integrations/relay/company-cards?operating_company_id=<uuid>
 *        → the owner-editable set of cards confirmed to belong to the company.
 * PUT  /api/integrations/relay/company-cards?operating_company_id=<uuid>
 *        body { card_last4, label?, source_hint?, is_active? } → upsert one company card. Owner/Admin.
 *        Adding a card here re-classifies matching deposits from 'unclassified' → 'company'.
 *
 * All Owner/Administrator only. No GL. posted_to_gl untouched.
 */
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/session-middleware.js";
import { withLuciaBypass } from "../../auth/db.js";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function requireOwnerAdmin(req: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }): boolean {
  const role = String((req as { user?: { role?: string } }).user?.role ?? "");
  if (!["Owner", "Administrator"].includes(role)) { reply.code(403).send({ error: "forbidden" }); return false; }
  return true;
}

export async function registerRelayDepositReviewRoutes(app: FastifyInstance) {
  // ── Review queue: deposits + summary ──
  app.get("/api/integrations/relay/deposits", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    if (!requireOwnerAdmin(req, reply)) return;
    const q = (req.query ?? {}) as { operating_company_id?: string; classification?: string };
    const opco = String(q.operating_company_id ?? "");
    if (!UUID_RE.test(opco)) return reply.code(400).send({ error: "operating_company_id query param required (uuid)" });
    const classFilter = q.classification && ["company", "unclassified", "canceled"].includes(q.classification) ? q.classification : null;

    return withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [opco]);
      const rows = (await client.query(
        `SELECT id::text, deposit_id, relay_created_at, status, total_amount_cents,
                funding_card_last4, note_raw, classification, matched_bank_transaction_id::text
         FROM integrations.relay_deposits
         WHERE operating_company_id = $1::uuid AND is_active AND voided_at IS NULL
           ${classFilter ? "AND classification = $2" : ""}
         ORDER BY relay_created_at DESC`,
        classFilter ? [opco, classFilter] : [opco]
      )).rows;

      // Summary by classification (money = settled only; canceled excluded from the spend totals).
      const summary = (await client.query(
        `SELECT classification,
                count(*)::int AS n,
                coalesce(sum(total_amount_cents) FILTER (WHERE status = 'settled'), 0)::bigint AS settled_cents
         FROM integrations.relay_deposits
         WHERE operating_company_id = $1::uuid AND is_active AND voided_at IS NULL
         GROUP BY classification`,
        [opco]
      )).rows;

      const byCard = (await client.query(
        `SELECT funding_card_last4, classification,
                count(*)::int AS n,
                coalesce(sum(total_amount_cents) FILTER (WHERE status = 'settled'), 0)::bigint AS settled_cents
         FROM integrations.relay_deposits
         WHERE operating_company_id = $1::uuid AND is_active AND voided_at IS NULL
         GROUP BY funding_card_last4, classification
         ORDER BY settled_cents DESC`,
        [opco]
      )).rows;

      return reply.code(200).send({ operating_company_id: opco, count: rows.length, deposits: rows, summary, by_card: byCard });
    });
  });

  // ── Company-card map: read ──
  app.get("/api/integrations/relay/company-cards", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    if (!requireOwnerAdmin(req, reply)) return;
    const opco = String(((req.query ?? {}) as { operating_company_id?: string }).operating_company_id ?? "");
    if (!UUID_RE.test(opco)) return reply.code(400).send({ error: "operating_company_id query param required (uuid)" });
    return withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [opco]);
      const rows = (await client.query(
        `SELECT id::text, card_last4, label, source_hint, is_active
         FROM integrations.relay_company_cards
         WHERE operating_company_id = $1::uuid AND voided_at IS NULL
         ORDER BY card_last4`,
        [opco]
      )).rows;
      return reply.code(200).send({ operating_company_id: opco, cards: rows });
    });
  });

  // ── Company-card map: upsert one card (owner adds/labels/deactivates). Re-classifies deposits. ──
  app.put("/api/integrations/relay/company-cards", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    if (!requireOwnerAdmin(req, reply)) return;
    const opco = String(((req.query ?? {}) as { operating_company_id?: string }).operating_company_id ?? "");
    if (!UUID_RE.test(opco)) return reply.code(400).send({ error: "operating_company_id query param required (uuid)" });
    const body = (req.body ?? {}) as { card_last4?: string; label?: string; source_hint?: string; is_active?: boolean };
    const card = String(body.card_last4 ?? "").trim();
    if (!/^[0-9]{4}$/.test(card)) return reply.code(400).send({ error: "card_last4 must be exactly 4 digits" });
    const isActive = body.is_active !== false;

    return withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [opco]);
      await client.query(
        `INSERT INTO integrations.relay_company_cards (operating_company_id, card_last4, label, source_hint, is_active, voided_at)
         VALUES ($1::uuid, $2, $3, $4, $5, NULL)
         ON CONFLICT (operating_company_id, card_last4)
         DO UPDATE SET label = EXCLUDED.label, source_hint = EXCLUDED.source_hint, is_active = EXCLUDED.is_active,
                       voided_at = NULL, updated_at = now()`,
        [opco, card, body.label ?? null, body.source_hint ?? null, isActive]
      );
      // Re-classify existing deposits for this card: active company card → 'company'; else back to
      // 'unclassified' (canceled rows stay 'canceled'). NEVER posts. Storage snapshot only.
      const newClass = isActive ? "company" : "unclassified";
      const updated = (await client.query(
        `UPDATE integrations.relay_deposits
         SET classification = $3, updated_at = now()
         WHERE operating_company_id = $1::uuid AND funding_card_last4 = $2
           AND classification <> 'canceled' AND status <> 'canceled'
         RETURNING id`,
        [opco, card, newClass]
      )).rowCount ?? 0;
      return reply.code(200).send({ operating_company_id: opco, card_last4: card, is_active: isActive, reclassified_deposits: updated });
    });
  });
}
