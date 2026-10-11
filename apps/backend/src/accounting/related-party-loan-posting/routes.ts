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
import { prepareInterestAccrual } from "./interest-accrual.service.js";
import { statusListCondition, statusListParam } from "../../lib/status-list.js";
import { listRelatedPartyLoanFacilities } from "./facility.service.js";
import {
  RELATED_PARTY_LOAN_TARGET_TYPES,
  createRelatedPartyLoanEntry,
} from "./create-entry.service.js";

const TARGET_TYPES = RELATED_PARTY_LOAN_TARGET_TYPES; // includes party_transfer_out (443.59)

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  direction: z.enum(["in", "out"]).optional(),
  target_type: z.enum(TARGET_TYPES).optional(),
  facility_id: z.string().uuid().optional(),
  counterparty_id: z.string().uuid().optional(),
  // U12 — multi-select: ?status=a&status=b (one value still accepted).
  status: statusListParam(["draft", "open", "paid", "reversed"] as const),
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
  target_type: z.enum(TARGET_TYPES),
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
  /** ROUND 443.22-2a — optional bank line that opened the Loan wizard (reverse pointer). */
  bank_transaction_id: z.string().uuid().nullable().optional(),
  /**
   * ROUND 443.22-2e — CoA debit for paid_direct_vendor (what was paid for: Relay Fuel Wallet, etc.).
   * Required when target_type is paid_direct_vendor; must be null/omitted for bank-line fundings.
   */
  funding_account_id: z.string().uuid().nullable().optional(),
  /** ROUND 443.22-2e — optional intermediary who paid from a personal account (Alberto). */
  intermediary_name: z.string().trim().max(200).optional(),
  /** 443.64 — party_relay_funded: fee amount in cents (e.g. 16250 for $162.50). */
  fee_cents: z.number().int().positive().nullable().optional(),
  /** 443.64 — party_relay_funded: CoA account id for the fee (e.g. 5005 Fuel Card Fees). */
  fee_account_id: z.string().uuid().nullable().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

export async function registerRelatedPartyLoanRoutes(app: FastifyInstance) {
  // ── FACILITIES — Option 1: one running LOC per person (ROUND 443.22-2b). ─────────────────────────
  app.get(
    "/api/v1/accounting/related-party-loan-facilities",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return reply;
      const parsed = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);

      const facilities = await withCompanyScope(authUser.uuid, parsed.data.operating_company_id, async (client) =>
        listRelatedPartyLoanFacilities(client, parsed.data.operating_company_id)
      );
      return { facilities, total_count: facilities.length };
    }
  );

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
        if (!q.status?.length) filters.push("e.reversed_at IS NULL");
        if (q.direction) {
          values.push(q.direction);
          filters.push(`e.direction = $${values.length}`);
        }
        if (q.target_type) {
          values.push(q.target_type);
          filters.push(`e.target_type = $${values.length}`);
        }
        if (q.facility_id) {
          values.push(q.facility_id);
          filters.push(`e.facility_id = $${values.length}::uuid`);
        }
        if (q.counterparty_id) {
          values.push(q.counterparty_id);
          filters.push(`e.counterparty_id = $${values.length}`);
        }
        const statusCond = statusListCondition("e.status", q.status, (v) => {
          values.push(v);
          return `$${values.length}`;
        });
        if (statusCond) filters.push(statusCond);
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
                   e.facility_id::text,
                   e.display_id,
                   e.document_kind,
                   e.funding_account_id::text,
                   fa.account_number AS funding_account_number,
                   fa.account_name AS funding_account_name,
                   e.intermediary_name,
                   e.note_file_id::text,
                   CASE WHEN e.note_html IS NOT NULL AND length(e.note_html) > 0 THEN true ELSE false END AS has_note,
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
              LEFT JOIN catalogs.accounts fa
                ON fa.id = e.funding_account_id AND fa.operating_company_id = e.operating_company_id
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

      // Writer lives in create-entry.service.ts so CC-2 Relay deposit poster can call
      // createPaidDirectVendorAdvance for cards 0210 / 6248 / 9855 (not 5007 Amex).
      const result = await withCompanyScope(authUser.uuid, b.operating_company_id, async (client) =>
        createRelatedPartyLoanEntry(client, b, authUser.uuid)
      );

      if ("error" in result) {
        if (result.error === "repayment_exceeds_facility_open_balance") {
          return reply.code(400).send({
            error: result.error,
            open_balance_cents: result.open_balance_cents,
            principal_cents: result.principal_cents,
            facility_id: result.facility_id,
            message: result.message,
          });
        }
        return reply.code(400).send({ error: result.error });
      }
      return reply.code(201).send(result);
    }
  );

  // ── PARTY LEDGER (443.59) — running account for one facility / party. ────────────────────────────
  // Returns every JE line that posted to the party's 2410 sub-account, with running balance,
  // plus the balance sign ("due_to" = liability = party funded USMCA; "due_from" = asset = USMCA
  // advanced more than received). Owner reads this as "Do I owe them?" vs "Do they owe me?".
  app.get(
    "/api/v1/accounting/related-party-loans/ledger/:facilityId",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return reply;
      const params = z.object({ facilityId: z.string().uuid() }).safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
      if (!q.success) return validationError(reply, q.error);

      const result = await withCompanyScope(authUser.uuid, q.data.operating_company_id, async (client) => {
        const fac = (await client.query(
          `SELECT f.id::text, f.account_id::text, a.account_number, a.account_name,
                  f.counterparty_name, f.relationship
             FROM accounting.related_party_loan_facilities f
             LEFT JOIN catalogs.accounts a ON a.id = f.account_id
            WHERE f.id = $1::uuid AND f.operating_company_id = $2::uuid AND f.deleted_at IS NULL
            LIMIT 1`,
          [params.data.facilityId, q.data.operating_company_id]
        )) as { rows: Array<Record<string, string>> };
        if (!fac.rows[0]) return { notFound: true as const };
        const facility = fac.rows[0];

        // All posted JE lines for the party's 2410 account, ordered chronologically.
        // A credit to 2410 = party funded USMCA (running credit balance = USMCA owes party).
        // A debit to 2410 = USMCA sent money to party (reduces credit or creates debit balance).
        // bank_line: the matched bank transaction (description, date, amount) for context.
        // pair_status: 'paired' when a party_relay_funded entry has a party_transfer_out
        //   on the same facility within 5 days; 'unpaired' otherwise (order item 4 / 443.64).
        const lines = (await client.query(
          `SELECT jep.id::text,
                  je.entry_date::text AS date,
                  je.memo,
                  jep.debit_or_credit,
                  jep.amount_cents,
                  e.id::text AS loan_id,
                  e.display_id AS loan_display_id,
                  e.target_type,
                  e.direction,
                  e.counterparty_name,
                  bt.description AS bank_line_description,
                  bt.transaction_date::text AS bank_line_date,
                  bt.amount_cents AS bank_line_amount_cents,
                  bt.id::text AS bank_line_id,
                  CASE
                    WHEN e.target_type IN ('party_relay_funded', 'paid_direct_vendor', 'party_paid_vendor')
                      AND EXISTS (
                        SELECT 1 FROM accounting.related_party_loan_entries e2
                         JOIN accounting.related_party_loan_facilities f2
                           ON f2.id = e2.facility_id
                        WHERE f2.account_id = $1::uuid
                          AND e2.target_type = 'party_transfer_out'
                          AND ABS(e2.entry_date::date - e.entry_date::date) <= 5
                          AND e2.principal_cents = jep.amount_cents
                      ) THEN 'paired'
                    WHEN e.target_type IN ('party_relay_funded', 'paid_direct_vendor', 'party_paid_vendor')
                      THEN 'unpaired'
                    ELSE NULL
                  END AS pair_status,
                  SUM(
                    CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents
                         ELSE -jep.amount_cents END
                  ) OVER (ORDER BY je.entry_date, je.created_at, jep.id) AS running_balance_cents
             FROM accounting.journal_entry_postings jep
             JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
               AND je.voided_at IS NULL AND je.status = 'posted'
               AND je.operating_company_id = $2::uuid
             LEFT JOIN accounting.related_party_loan_entries e
               ON e.je_id = je.id AND e.operating_company_id = $2::uuid
             LEFT JOIN banking.bank_transactions bt
               ON bt.id = e.bank_transaction_id AND bt.operating_company_id = $2::uuid
            WHERE jep.account_id = $1::uuid
            ORDER BY je.entry_date, je.created_at, jep.id`,
          [facility.account_id, q.data.operating_company_id]
        )) as { rows: Array<Record<string, unknown>> };

        const balanceCents = (lines.rows[lines.rows.length - 1] as { running_balance_cents?: number } | undefined)
          ?.running_balance_cents ?? 0;
        // credit balance = USMCA owes party = "Due to <party>" (liability)
        // debit balance = party owes USMCA = "Due from <party>" (asset)
        const balanceSign = balanceCents >= 0 ? "due_to" : "due_from";

        return { facility, lines: lines.rows, balance_cents: balanceCents, balance_sign: balanceSign };
      });

      if ("notFound" in result) return reply.code(404).send({ error: "facility_not_found" });
      return result;
    }
  );
}
