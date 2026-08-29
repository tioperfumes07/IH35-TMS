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
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { withLuciaBypass } from "../../auth/db.js";

const UUID_RE = /^[0-9a-f-]{36}$/i;

type OfficeUser = { uuid: string; role: string };

function requireOwnerAdmin(req: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }): OfficeUser | null {
  const user = (req as { user?: OfficeUser }).user;
  const role = String(user?.role ?? "");
  if (!["Owner", "Administrator"].includes(role)) { reply.code(403).send({ error: "forbidden" }); return null; }
  return user ?? null;
}

export async function registerRelayDepositReviewRoutes(app: FastifyInstance) {
  // ── Review queue: deposits + summary ──
  app.get("/api/integrations/relay/deposits", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const user = requireOwnerAdmin(req, reply);
    if (!user) return;
    const q = (req.query ?? {}) as { operating_company_id?: string; classification?: string };
    const opco = String(q.operating_company_id ?? "");
    if (!UUID_RE.test(opco)) return reply.code(400).send({ error: "operating_company_id query param required (uuid)" });
    await assertCompanyMembership(user.uuid, opco);
    const classFilter = q.classification && ["company", "unclassified", "canceled"].includes(q.classification) ? q.classification : null;

    return withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
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
    const user = requireOwnerAdmin(req, reply);
    if (!user) return;
    const opco = String(((req.query ?? {}) as { operating_company_id?: string }).operating_company_id ?? "");
    if (!UUID_RE.test(opco)) return reply.code(400).send({ error: "operating_company_id query param required (uuid)" });
    await assertCompanyMembership(user.uuid, opco);
    return withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const rows = (await client.query(
        // CONN-3 Part D drill-through: surface WHICH account each card actually draws on, and the GL
        // account that funding would credit. A card with funding_bank_account_id NULL is reported
        // unmapped rather than hidden — the future stage-1 poster fails closed on exactly that state,
        // so the owner needs to see it here instead of discovering it when a deposit refuses to post.
        `SELECT c.id::text, c.card_last4, c.label, c.source_hint, c.is_active,
                c.funding_bank_account_id::text AS funding_bank_account_id,
                ba.account_name                 AS funding_account_name,
                ba.account_class                AS funding_account_class,
                led.account_number              AS funding_gl_account_number,
                led.account_name                AS funding_gl_account_name,
                led.account_type                AS funding_gl_account_type,
                (c.funding_bank_account_id IS NULL) AS funding_unmapped
         FROM integrations.relay_company_cards c
         LEFT JOIN banking.bank_accounts ba ON ba.id = c.funding_bank_account_id
         LEFT JOIN catalogs.accounts led ON led.id = ba.ledger_account_id
                                         AND led.operating_company_id = $1::uuid
         WHERE c.operating_company_id = $1::uuid AND c.voided_at IS NULL
         ORDER BY c.card_last4`,
        [opco]
      )).rows;
      return reply.code(200).send({ operating_company_id: opco, cards: rows });
    });
  });

  // ── Company-card map: upsert one card (owner adds/labels/deactivates). Re-classifies deposits. ──
  app.put("/api/integrations/relay/company-cards", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const user = requireOwnerAdmin(req, reply);
    if (!user) return;
    const opco = String(((req.query ?? {}) as { operating_company_id?: string }).operating_company_id ?? "");
    if (!UUID_RE.test(opco)) return reply.code(400).send({ error: "operating_company_id query param required (uuid)" });
    await assertCompanyMembership(user.uuid, opco);
    const body = (req.body ?? {}) as { card_last4?: string; label?: string; source_hint?: string; is_active?: boolean };
    const card = String(body.card_last4 ?? "").trim();
    if (!/^[0-9]{4}$/.test(card)) return reply.code(400).send({ error: "card_last4 must be exactly 4 digits" });
    const isActive = body.is_active !== false;

    return withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const cardResult = await client.query<{
        id: string;
        label: string | null;
        source_hint: string | null;
        is_active: boolean;
      }>(
        `INSERT INTO integrations.relay_company_cards AS existing (operating_company_id, card_last4, label, source_hint, is_active, voided_at)
         VALUES ($1::uuid, $2, $3, $4, $5, NULL)
         ON CONFLICT (operating_company_id, card_last4)
         DO UPDATE SET label = COALESCE(EXCLUDED.label, existing.label),
                       source_hint = COALESCE(EXCLUDED.source_hint, existing.source_hint),
                       is_active = EXCLUDED.is_active,
                       voided_at = NULL, updated_at = now()
         RETURNING id::text, label, source_hint, is_active`,
        [opco, card, body.label ?? null, body.source_hint ?? null, isActive]
      );
      const persistedCard = cardResult.rows[0];
      if (!persistedCard) throw new Error("relay_company_card_write_failed");
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
      await appendCrudAudit(
        client,
        user.uuid,
        "integrations.relay_company_card.updated",
        {
          operating_company_id: opco,
          relay_company_card_id: persistedCard.id,
          card_last4: card,
          label: persistedCard.label,
          source_hint: persistedCard.source_hint,
          is_active: persistedCard.is_active,
          reclassified_deposits: updated,
        },
        "info",
        "FUEL-RELAY-CARD-REVIEW",
      );
      return reply.code(200).send({
        operating_company_id: opco,
        id: persistedCard.id,
        card_last4: card,
        label: persistedCard.label,
        source_hint: persistedCard.source_hint,
        is_active: persistedCard.is_active,
        reclassified_deposits: updated,
      });
    });
  });
}
