/**
 * LOAN-05 — Loans & Advances read + create API.
 *
 * This is the READ path §10a requires: accounting.related_party_loan_entries and
 * related_party_loan_schedule were created in LOAN-01 and, until this file existed, nothing read them.
 * A table with no reader is dead schema — it implies a feature that does not exist — and
 * verify-no-dead-schema correctly failed the branch for it.
 *
 * SERVER-SIDE FILTERING (V3). Type / direction / counterparty / date-range filter in SQL against the
 * canonical table, entity-scoped. Filtering a page of results in the browser would show a "balance" that
 * is the balance of whatever happened to load — the register's running total has to mean something.
 *
 * CREATE also generates and persists the amortization schedule in the SAME transaction as the entry.
 * A loan whose schedule failed to write is a loan nobody will be reminded to collect, and the whole
 * point of the auto-deduct policy is that the schedule exists.
 *
 * POSTS NOTHING HERE. Creating the record and posting its JE are separate acts: the entry is written
 * with je_id NULL, and posting happens through the flag-gated poster. That is why je_id is nullable in
 * the schema — a draft must be writable before its JE exists.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { currentAuthUser, validationError, withCompanyScope } from "../shared.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { buildLoanSchedule } from "./schedule.service.js";
import { prepareInterestAccrual } from "./interest-accrual.service.js";

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  direction: z.enum(["in", "out"]).optional(),
  target_type: z
    .enum(["bill", "settlement", "cash_advance", "expense", "loan_out", "repayment", "intercompany"])
    .optional(),
  counterparty_id: z.string().uuid().optional(),
  status: z.enum(["draft", "open", "paid", "reversed"]).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const createBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  direction: z.enum(["in", "out"]),
  relationship: z.enum(["owner", "spouse", "friend", "employee", "related_company", "other"]),
  counterparty_kind: z.enum(["user", "driver", "vendor", "company", "other"]),
  counterparty_id: z.string().uuid().nullable().optional(),
  counterparty_name: z.string().trim().max(200).optional(),
  account_id: z.string().uuid(),
  target_type: z.enum([
    "bill",
    "settlement",
    "cash_advance",
    "expense",
    "loan_out",
    "repayment",
    "intercompany",
  ]),
  target_id: z.string().uuid().nullable().optional(),
  principal_cents: z.number().int().positive(),
  entry_date: z.string().date(),
  interest_rate_bps: z.number().int().min(0).default(0),
  interest_method: z.enum(["simple", "amortized", "none"]).optional(),
  payment_frequency: z
    .enum(["weekly", "biweekly", "semimonthly", "monthly", "per_settlement", "lump_sum"])
    .optional(),
  payment_count: z.number().int().positive().nullable().optional(),
  first_payment_date: z.string().date().optional(),
  funding_source_note: z.string().trim().max(500).optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

export async function registerRelatedPartyLoanRoutes(app: FastifyInstance) {
  // ── LIST — the register. Every filter is applied in SQL, entity-scoped. ──────────────────────────
  app.get(
    "/api/v1/accounting/related-party-loans",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return reply;
      const parsed = listQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const q = parsed.data;

      const result = await withCompanyScope(authUser.uuid, q.operating_company_id, async (client) => {
        const values: unknown[] = [q.operating_company_id];
        const filters: string[] = ["e.operating_company_id = $1::uuid", "e.deleted_at IS NULL"];
        // void-not-delete: a reversed entry is retained forever but must not inflate the register's
        // running balance. It is included only when the caller asks for that status explicitly.
        if (!q.status) filters.push("e.reversed_at IS NULL");
        if (q.direction) {
          values.push(q.direction);
          filters.push(`e.direction = $${values.length}`);
        }
        if (q.target_type) {
          values.push(q.target_type);
          filters.push(`e.target_type = $${values.length}`);
        }
        if (q.counterparty_id) {
          values.push(q.counterparty_id);
          filters.push(`e.counterparty_id = $${values.length}`);
        }
        if (q.status) {
          values.push(q.status);
          filters.push(`e.status = $${values.length}`);
        }
        if (q.from) {
          values.push(q.from);
          filters.push(`e.entry_date >= $${values.length}::date`);
        }
        if (q.to) {
          values.push(q.to);
          filters.push(`e.entry_date <= $${values.length}::date`);
        }
        const where = `WHERE ${filters.join(" AND ")}`;

        const countRes = (await client.query(
          `SELECT count(*)::int AS total FROM accounting.related_party_loan_entries e ${where}`,
          values
        )) as { rows: Array<{ total: number }> };

        values.push(q.limit, q.offset);
        const rows = (await client.query(
          `
            SELECT e.id::text,
                   e.direction,
                   e.relationship,
                   e.counterparty_kind,
                   e.counterparty_id::text,
                   e.counterparty_name,
                   e.account_id::text,
                   a.account_number,
                   a.account_name,
                   e.target_type,
                   e.target_id::text,
                   e.principal_cents,
                   e.entry_date::text,
                   e.interest_rate_bps,
                   e.payment_frequency,
                   e.payment_count,
                   e.first_payment_date::text,
                   e.status,
                   e.je_id::text,
                   -- Reversal + related-party state belong in the REGISTER, not just the detail page:
                   -- a row that has been reversed must never read as live, and ASC 850 related-party
                   -- disclosure depends on the tag being visible where the balances are reviewed.
                   e.related_party,
                   e.reversed_of::text,
                   e.reversed_at::text,
                   -- The register's running balance comes from the SCHEDULE, not from the entry: the
                   -- principal is what was lent, the balance is what is left after posted payments.
                   COALESCE((
                     SELECT s.remaining_balance_cents
                     FROM accounting.related_party_loan_schedule s
                     WHERE s.loan_id = e.id AND s.is_active AND s.posted
                     ORDER BY s.payment_number DESC
                     LIMIT 1
                   ), e.principal_cents) AS balance_cents,
                   (
                     SELECT min(s.due_date)::text
                     FROM accounting.related_party_loan_schedule s
                     WHERE s.loan_id = e.id AND s.is_active AND NOT s.posted
                   ) AS next_due_date,
                   e.created_at::text
              FROM accounting.related_party_loan_entries e
              LEFT JOIN catalogs.accounts a
                ON a.id = e.account_id AND a.operating_company_id = e.operating_company_id
            ${where}
             ORDER BY e.entry_date DESC, e.created_at DESC
             LIMIT $${values.length - 1} OFFSET $${values.length}
          `,
          values
        )) as { rows: Array<Record<string, unknown>> };

        return { rows: rows.rows, total: countRes.rows[0]?.total ?? 0 };
      });

      return {
        loans: result.rows,
        total_count: result.total,
        has_more: q.offset + q.limit < result.total,
      };
    }
  );

  // ── DETAIL — entry + its schedule (the reverse half of the linkage). ─────────────────────────────
  app.get(
    "/api/v1/accounting/related-party-loans/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);

    const result = await withCompanyScope(authUser.uuid, q.data.operating_company_id, async (client) => {
      const entry = (await client.query(
        `SELECT e.*, a.account_number, a.account_name
           FROM accounting.related_party_loan_entries e
           LEFT JOIN catalogs.accounts a
             ON a.id = e.account_id AND a.operating_company_id = e.operating_company_id
          WHERE e.id = $1::uuid AND e.operating_company_id = $2::uuid AND e.deleted_at IS NULL
          LIMIT 1`,
        [params.data.id, q.data.operating_company_id]
      )) as { rows: Array<Record<string, unknown>> };
      if (!entry.rows[0]) return { notFound: true as const };

      const schedule = (await client.query(
        `SELECT payment_number, due_date::text, payment_cents, principal_cents, interest_cents,
                remaining_balance_cents, posted, posted_journal_entry_id::text
           FROM accounting.related_party_loan_schedule
          WHERE loan_id = $1::uuid AND operating_company_id = $2::uuid AND is_active
          ORDER BY payment_number`,
        [params.data.id, q.data.operating_company_id]
      )) as { rows: Array<Record<string, unknown>> };

      return { entry: entry.rows[0], schedule: schedule.rows };
    });

    if ("notFound" in result) return reply.code(404).send({ error: "related_party_loan_not_found" });
    return result;
    }
  );

  // ── INTEREST ACCRUAL PREVIEW (LOAN-07) — computes the entry, writes NOTHING. ─────────────────────
  // A DRY RUN IS THE POINT, not a limitation. RELATED_PARTY_LOAN_GL_POSTING_ENABLED is OFF on every
  // entity and stays OFF until a balanced tie-out is proven per entity — but "prove the tie-out" needs
  // an instrument that shows the exact accounts and amounts the poster WOULD use, on real rows, without
  // touching the ledger. This is that instrument. It exercises the same resolver and the same builder as
  // the live path, so a green preview is evidence about the live path and not about a parallel mock.
  //
  // It also surfaces the refusal. If related_party_interest_expense (or 1260) is unbound for the entity,
  // this returns 200 with can_post:false and the missing role NAMED — visible before the flag flips,
  // rather than as a 500 the first time real interest accrues.
  app.get(
    "/api/v1/accounting/related-party-loans/:id/interest-accrual/preview",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return reply;
      const params = idParamSchema.safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
      if (!q.success) return validationError(reply, q.error);

      const result = await withCompanyScope(authUser.uuid, q.data.operating_company_id, async (client) => {
        const loan = (await client.query(
          `SELECT e.id::text, e.direction, e.account_id::text AS account_id, e.counterparty_name,
                  e.interest_rate_bps, e.reversed_at
             FROM accounting.related_party_loan_entries e
            WHERE e.id = $1::uuid AND e.operating_company_id = $2::uuid AND e.deleted_at IS NULL
            LIMIT 1`,
          [params.data.id, q.data.operating_company_id]
        )) as {
          rows: Array<{
            id: string;
            direction: "in" | "out";
            account_id: string;
            counterparty_name: string | null;
            interest_rate_bps: number;
            reversed_at: string | null;
          }>;
        };
        const row = loan.rows[0];
        if (!row) return { notFound: true as const };
        // A reversed loan accrues nothing. Interest on an entry that was voided would be interest on a
        // debt that no longer exists.
        if (row.reversed_at) return { reversed: true as const };

        // The NEXT unposted schedule row — accrual follows the schedule the counterparty was given,
        // rather than re-deriving interest and drifting from that document.
        const next = (await client.query(
          `SELECT payment_number, due_date::text AS due_date, interest_cents
             FROM accounting.related_party_loan_schedule
            WHERE loan_id = $1::uuid AND operating_company_id = $2::uuid
              AND is_active AND NOT posted
            ORDER BY payment_number
            LIMIT 1`,
          [params.data.id, q.data.operating_company_id]
        )) as { rows: Array<{ payment_number: number; due_date: string; interest_cents: number }> };
        const due = next.rows[0];
        if (!due) return { nothingDue: true as const };

        const prepared = await prepareInterestAccrual(client as never, {
          operating_company_id: q.data.operating_company_id,
          direction: row.direction,
          loan_account_id: row.account_id,
          interest_cents: due.interest_cents,
          payment_number: due.payment_number,
          counterparty_label: row.counterparty_name ?? "related party",
        });

        return { loan: row, due, prepared };
      });

      if ("notFound" in result) return reply.code(404).send({ error: "related_party_loan_not_found" });
      if ("reversed" in result) {
        return { can_post: false, reason: "loan_reversed", postings: [] };
      }
      if ("nothingDue" in result) {
        return { can_post: false, reason: "no_unposted_schedule_row", postings: [] };
      }

      const { prepared, due, loan } = result;
      if (!prepared.ok) {
        return {
          can_post: false,
          reason: prepared.reason,
          // Named, not swallowed — the whole reason a preview exists.
          missing_role: prepared.missing_role ?? null,
          payment_number: due.payment_number,
          interest_cents: due.interest_cents,
          postings: [],
        };
      }
      return {
        can_post: true,
        direction: loan.direction,
        payment_number: due.payment_number,
        due_date: due.due_date,
        interest_cents: prepared.amount_cents,
        memo: prepared.memo,
        postings: prepared.postings,
        // Restated on every response so a caller reading this can never mistake it for a posted entry.
        posted: false,
        note: "preview only — no journal entry was written",
      };
    }
  );

  // ── CREATE — entry + schedule in ONE transaction. ────────────────────────────────────────────────
  app.post(
    "/api/v1/accounting/related-party-loans",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return reply;
      const parsed = createBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const b = parsed.data;

      const result = await withCompanyScope(authUser.uuid, b.operating_company_id, async (client) => {
        // The account must belong to THIS entity. A loan booked against another company's account
        // moves money between books.
        const acct = (await client.query(
          `SELECT id::text FROM catalogs.accounts
            WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL LIMIT 1`,
          [b.account_id, b.operating_company_id]
        )) as { rows: Array<{ id: string }> };
        if (!acct.rows[0]) return { error: "account_not_found_for_company" as const };

        const inserted = (await client.query(
          `INSERT INTO accounting.related_party_loan_entries
             (operating_company_id, direction, relationship, counterparty_kind, counterparty_id,
              counterparty_name, account_id, target_type, target_id, principal_cents, entry_date,
              interest_rate_bps, interest_method, payment_frequency, payment_count, first_payment_date,
              funding_source_note, status, created_by_user_id)
           VALUES ($1::uuid,$2,$3,$4,$5::uuid,$6,$7::uuid,$8,$9::uuid,$10,$11::date,$12,$13,$14,$15,$16::date,$17,'open',$18::uuid)
           RETURNING id::text, direction, principal_cents, entry_date::text`,
          [
            b.operating_company_id,
            b.direction,
            b.relationship,
            b.counterparty_kind,
            b.counterparty_id ?? null,
            b.counterparty_name ?? null,
            b.account_id,
            b.target_type,
            b.target_id ?? null,
            b.principal_cents,
            b.entry_date,
            b.interest_rate_bps,
            b.interest_method ?? null,
            b.payment_frequency ?? null,
            b.payment_count ?? null,
            b.first_payment_date ?? null,
            b.funding_source_note ?? null,
            authUser.uuid,
          ]
        )) as { rows: Array<{ id: string }> };
        const loanId = inserted.rows[0].id;

        // Schedule in the SAME transaction — a loan without one is a loan nobody gets reminded about.
        let scheduleRows = 0;
        if (b.payment_frequency && b.first_payment_date) {
          const rows = buildLoanSchedule({
            principalCents: b.principal_cents,
            interestRateBps: b.interest_rate_bps,
            paymentFrequency: b.payment_frequency,
            paymentCount: b.payment_count ?? null,
            firstPaymentDate: b.first_payment_date,
          });
          for (const r of rows) {
            await client.query(
              `INSERT INTO accounting.related_party_loan_schedule
                 (operating_company_id, loan_id, payment_number, due_date, payment_cents,
                  principal_cents, interest_cents, remaining_balance_cents, created_by_user_id)
               VALUES ($1::uuid,$2::uuid,$3,$4::date,$5,$6,$7,$8,$9::uuid)`,
              [
                b.operating_company_id,
                loanId,
                r.payment_number,
                r.due_date,
                r.payment_cents,
                r.principal_cents,
                r.interest_cents,
                r.remaining_balance_cents,
                authUser.uuid,
              ]
            );
          }
          scheduleRows = rows.length;
        }

        await appendCrudAudit(
          client,
          authUser.uuid,
          "accounting.related_party_loan.created",
          {
            resource_type: "accounting.related_party_loan_entries",
            resource_id: loanId,
            operating_company_id: b.operating_company_id,
            direction: b.direction,
            principal_cents: b.principal_cents,
            account_id: b.account_id,
            schedule_rows: scheduleRows,
          },
          "info",
          "LOAN-05"
        );

        return { id: loanId, schedule_rows: scheduleRows };
      });

      if ("error" in result) return reply.code(400).send({ error: result.error });
      return reply.code(201).send(result);
    }
  );
}
