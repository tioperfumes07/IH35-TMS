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
import { createJournalEntryOnClient } from "../../accounting/journal-entries.service.js";
import { postRelayDeposit, type DepositPostOutcome } from "./relay-deposit-post.service.js";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const RELAY_DEPOSIT_CLASSIFICATIONS = ["company", "party", "intercompany", "unclassified", "canceled"] as const;

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
    if (!requireAuth(req, reply)) return reply;
    const user = requireOwnerAdmin(req, reply);
    if (!user) return;
    const q = (req.query ?? {}) as { operating_company_id?: string; classification?: string };
    const opco = String(q.operating_company_id ?? "");
    if (!UUID_RE.test(opco)) return reply.code(400).send({ error: "operating_company_id query param required (uuid)" });
    await assertCompanyMembership(user.uuid, opco);
    const requestedClassification = q.classification?.trim();
    if (requestedClassification && !RELAY_DEPOSIT_CLASSIFICATIONS.includes(requestedClassification as (typeof RELAY_DEPOSIT_CLASSIFICATIONS)[number])) {
      return reply.code(400).send({
        error: `classification must be one of: ${RELAY_DEPOSIT_CLASSIFICATIONS.join(", ")}`,
      });
    }
    const classFilter = requestedClassification || null;

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
    if (!requireAuth(req, reply)) return reply;
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
                (c.funding_bank_account_id IS NULL) AS funding_unmapped,
                -- LEAD 443.133 B: the owner's card map (what a deposit on this card credits, and the owner's ruling).
                c.funding_kind, c.funding_account_number, c.funding_system_purpose,
                c.party_vendor_id::text AS party_vendor_id, c.party_relationship, c.owner_ruling
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
    if (!requireAuth(req, reply)) return reply;
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
        funding_kind: string | null;
      }>(
        `INSERT INTO integrations.relay_company_cards AS existing (operating_company_id, card_last4, label, source_hint, is_active, voided_at)
         VALUES ($1::uuid, $2, $3, $4, $5, NULL)
         ON CONFLICT (operating_company_id, card_last4)
         DO UPDATE SET label = COALESCE(EXCLUDED.label, existing.label),
                       source_hint = COALESCE(EXCLUDED.source_hint, existing.source_hint),
                       is_active = EXCLUDED.is_active,
                       voided_at = NULL, updated_at = now()
         RETURNING id::text, label, source_hint, is_active, funding_kind`,
        [opco, card, body.label ?? null, body.source_hint ?? null, isActive]
      );
      const persistedCard = cardResult.rows[0];
      if (!persistedCard) throw new Error("relay_company_card_write_failed");
      // Re-classify existing deposits for this card: active company card → 'company'; else back to
      // 'unclassified' (canceled rows stay 'canceled'). NEVER posts. Storage snapshot only.
      // LEAD 443.133 B: the card's class follows the owner's card map (party / intercompany / company).
      const fk = persistedCard.funding_kind;
      const newClass = !isActive ? "unclassified" : fk === "party" ? "party" : fk === "intercompany" ? "intercompany" : "company";
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
  /**
   * LEAD 443.133 B — classify every settled Relay deposit by the owner's card map and post it through the ONE deposit poster
   * (postRelayDeposit). Owner only. dry_run (default true) runs the whole thing and rolls it back. Each deposit runs in its
   * own savepoint, so one refusal never blocks the others; a refusal is reported by name. Already-posted deposits are only
   * stamped on their row (posted_to_gl, posted_journal_entry_id, classification) — metadata, never a second posting.
   */
  app.post("/api/integrations/relay/deposits/classify-and-post", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const user = (req as { user?: OfficeUser }).user;
    const opco = String((req.query as { operating_company_id?: string } | undefined)?.operating_company_id ?? "").trim();
    if (!UUID_RE.test(opco)) return reply.code(400).send({ error: "operating_company_id query param required (uuid)" });
    // Heavy CI peel (verify-company-membership-assert): the refusal audit writes into the REQUESTED company under the
    // bypass, so membership is proven first — a caller may never stamp a row into a company they do not belong to.
    await assertCompanyMembership(user!.uuid, opco);
    if (String(user?.role ?? "") !== "Owner") {
      await withLuciaBypass(async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
        await appendCrudAudit(client, String(user?.uuid ?? ""), "integrations.relay_deposits.classify_and_post_refused",
          { operating_company_id: opco, role: user?.role ?? null }, "warning", "RELAY-DEPOSIT-CARD-MAP");
      });
      return reply.code(403).send({ error: "owner_only" });
    }
    await assertCompanyMembership(user!.uuid, opco);
    const dryRun = (req.body as { dry_run?: boolean } | undefined)?.dry_run !== false;

    return withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      await client.query("SAVEPOINT relay_dep_run");
      const ids = (
        await client.query<{ id: string; card: string | null }>(
          `SELECT id::text, funding_card_last4 AS card FROM integrations.relay_deposits
            WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND lower(status) = 'settled'
            ORDER BY relay_created_at, deposit_id`,
          [opco]
        )
      ).rows;
      const deposits: Array<DepositPostOutcome & { card: string | null }> = [];
      for (const [i, row] of ids.entries()) {
        const sp = `relay_dep_${i}`;
        await client.query(`SAVEPOINT ${sp}`);
        try {
          const out = await postRelayDeposit(
            client as never,
            { operatingCompanyId: opco, relayDepositId: row.id, actorUserId: user!.uuid, actorRole: "Owner" },
            { createJournalEntryOnClient: createJournalEntryOnClient as never }
          );
          await client.query(`RELEASE SAVEPOINT ${sp}`);
          deposits.push({ ...out, card: row.card });
        } catch (err) {
          // A database refusal (e.g. the Relay Fuel Wallet would go negative, or the deposit already has a live entry)
          // undoes only this deposit and is reported by name; it is never swallowed silently.
          await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
          deposits.push({ outcome: "refused", deposit_id: row.id, reason: err instanceof Error ? err.message : String(err), card: row.card });
        }
      }
      const count = (o: string) => deposits.filter((d) => d.outcome === o).length;
      const byCard: Record<string, Record<string, number>> = {};
      for (const d of deposits) {
        const k = d.card ?? "none";
        byCard[k] = byCard[k] ?? {};
        byCard[k]![d.outcome] = (byCard[k]![d.outcome] ?? 0) + 1;
      }
      const summary = {
        dry_run: dryRun,
        operating_company_id: opco,
        considered: deposits.length,
        posted: count("posted"),
        already_posted: count("already_posted"),
        held: count("held"),
        refused: count("refused"),
        not_settled: count("not_settled"),
        by_card: byCard,
      };
      if (dryRun) {
        await client.query("ROLLBACK TO SAVEPOINT relay_dep_run");
      } else {
        await appendCrudAudit(client, user!.uuid, "integrations.relay_deposits.classified_and_posted",
          { ...summary, deposits: deposits.map((d) => ({ deposit_id: d.deposit_id, outcome: d.outcome, card: d.card })) }, "info", "RELAY-DEPOSIT-CARD-MAP");
        await client.query("RELEASE SAVEPOINT relay_dep_run");
      }
      return reply.code(200).send({ ...summary, deposits });
    });
  });
}
