/**
 * FEED-DAY-EXECUTOR ROUTE — the missing endpoint for executeHistoricalFeedDay().
 *
 * Lead order, 2026-09-23 ("YOU ARE NOT DONE, YOU ARE UNASSIGNED"), item 1: "The historical_backfill
 * write path is built (#22362 driver bills, #22373/#22393 fuel) but NOTHING CALLS IT FROM A ROUTE
 * YET. The feed-day executor (#22375) is a service with no endpoint. Wire it: one authenticated
 * route that runs ONE day and returns the report. clean = (refused 0 && skipped 0). It must refuse
 * to run day N+1 while day N is not closed."
 *
 * TRANSACTION CONTRACT (executeHistoricalFeedDay's own header, verified by reading it, not
 * assumed): the caller opens the transaction and COMMITs only when `report.clean` is true.
 * withCurrentUser() already IS that caller — it opens BEGIN before invoking its callback and
 * COMMITs on a normal return / ROLLBACKs on a thrown error (verified by reading its body, not
 * assumed). So "commit only when clean" here means: return normally from the callback when
 * clean (real COMMIT), throw a sentinel FeedDayNotCleanError carrying the report when not (real
 * ROLLBACK) — never call BEGIN/COMMIT/ROLLBACK by hand inside this callback, which would fight
 * withCurrentUser's own transaction it already opened.
 *
 * "DAY N-1 NOT CLOSED" — THE REAL GAP, closed here with what already exists rather than invented.
 * There is no DB table anywhere that tracks "feed day X is closed" (verified: neither
 * driver_finance nor a feed-specific schema has one). Per scripts/feed/README.md, a day closing
 * for real is TWO separate gates — this executor's own `clean` (write side) AND
 * `verify-feed-day.mjs --day` (reconciliation side, ties the day to Faro's own export) — "A day
 * closes only when both say so. There is no partial credit." This route enforces the WRITE-SIDE
 * half of that law only: it will not run day N+1 while day N's write side (this same executor,
 * run through this same route) has not landed clean. It does NOT invoke verify-feed-day.mjs
 * itself — that CLI gate reads a build-time control file (day_control.json) and stays a separate,
 * manual step an operator runs after this route reports clean, exactly as scripts/feed/README.md's
 * own "Running a day" recipe describes. Closure state is tracked via the append-only audit trail
 * (audit.audit_events, event_class "driver-finance.feed_day.closed") — no new schema, fully
 * queryable, and consistent with how every other durable fact in this system is recorded. The
 * caller names which day it considers "previous" (`previous_feed_date`) rather than this route
 * guessing a calendar predecessor, because Faro's own day sequence is NOT every calendar date
 * (23 real days spread over a longer range) — inventing a calendar-adjacency rule here would be
 * exactly the kind of guess this codebase's own law forbids.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { withCurrentUser } from "../auth/db.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import {
  executeHistoricalFeedDay,
  type FeedDayInput,
  type FeedDayLoadPlan,
  type FeedDayReport,
} from "./historical-feed-day.service.js";

const AUTHORITY_ROLES = new Set(["Owner", "Administrator", "Accountant"]);
const WRITE_RL = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

const FEED_DAY_CLOSED_EVENT_CLASS = "driver-finance.feed_day.closed";

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}
function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

const driverBillPlanSchema = z.object({
  gross_amount_cents: z.number().int().min(0),
  loaded_pay_cents: z.number().int().nullable().optional(),
  deadhead_pay_cents: z.number().int().nullable().optional(),
  miles_basis: z.number().nullable().optional(),
  miles_basis_type: z.enum(["short", "practical"]).nullable().optional(),
  rate_per_mile_cents: z.number().int().nullable().optional(),
  miles_deadhead: z.number().nullable().optional(),
  rate_empty_per_mile_cents: z.number().int().nullable().optional(),
});

const escrowHoldPlanSchema = z.object({
  description: z.string().trim().min(1).max(500),
  amount_cents: z.number().int(),
});

const loadPlanSchema = z.object({
  load_id: z.string().uuid(),
  load_number: z.string().trim().min(1).max(60),
  driver_id: z.string().uuid(),
  team_driver_id: z.string().uuid().nullable().optional(),
  driver_bill: driverBillPlanSchema.optional(),
  escrow_holds: z.array(escrowHoldPlanSchema).optional(),
  fuel_transaction_ids: z.array(z.string().uuid()).optional(),
});

const runFeedDayBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  feed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "feed_date must be ISO yyyy-mm-dd"),
  source_document_ref: z.string().trim().min(1).max(200),
  loads: z.array(loadPlanSchema).min(1).max(500),
  stop_on_first_refusal: z.boolean().optional(),
  dry_run: z.boolean().optional(),
  /**
   * The feed day this route must confirm is CLOSED (this route's own write-side definition, see
   * header) before running `feed_date`. Omit only for the very first day of a re-feed sequence —
   * there is nothing to have closed yet. A real day 2+ that omits this bypasses the entire
   * sequencing law this route exists to enforce, so omission is accepted but never silent: it is
   * named in the response (`previous_day_check: "skipped_no_previous_named"`) so an operator
   * reviewing the report sees it was not checked, rather than assuming it was.
   */
  previous_feed_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "previous_feed_date must be ISO yyyy-mm-dd")
    .nullable()
    .optional(),
});

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

type PreviousDayCheck = "not_applicable" | "skipped_no_previous_named" | "confirmed_closed";

async function isFeedDayClosed(client: DbClient, operatingCompanyId: string, feedDate: string): Promise<boolean> {
  const res = await client.query<{ found: number }>(
    `
      SELECT count(*)::int AS found
      FROM audit.audit_events
      WHERE event_class = $1
        AND payload->>'operating_company_id' = $2
        AND payload->>'feed_date' = $3
      LIMIT 1
    `,
    [FEED_DAY_CLOSED_EVENT_CLASS, operatingCompanyId, feedDate]
  );
  return Number(res.rows[0]?.found ?? 0) > 0;
}

/** Thrown to force withCurrentUser's own ROLLBACK when the day is not clean (or is a dry run) —
 *  carries the full report + check state so the route handler can still respond 200/422 with it
 *  rather than a bare 500. Never a real error condition; the executor itself never throws for a
 *  business refusal (its own law) — this class exists purely to signal "do not commit." */
class FeedDayNotCleanError extends Error {
  report: FeedDayReport;
  previousDayCheck: PreviousDayCheck;
  constructor(report: FeedDayReport, previousDayCheck: PreviousDayCheck) {
    super(`feed day ${report.feed_date} not committed: clean=${report.clean} dry_run=${report.dry_run}`);
    this.name = "FeedDayNotCleanError";
    this.report = report;
    this.previousDayCheck = previousDayCheck;
  }
}

/** Thrown for a refusal decided BEFORE the executor even runs (previous day unclosed, or this
 *  day already closed) — also forces ROLLBACK via withCurrentUser, carries an HTTP status. */
class FeedDayPreflightError extends Error {
  status: number;
  payload: Record<string, unknown>;
  constructor(status: number, payload: Record<string, unknown>) {
    super(String(payload.error ?? "feed_day_preflight_refused"));
    this.name = "FeedDayPreflightError";
    this.status = status;
    this.payload = payload;
  }
}

export function registerHistoricalFeedDayRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/driver-finance/feed-day/run — execute one historical settlement day through the
   * shared executor and return its report. Refuses to run when `previous_feed_date` is named and
   * has not itself landed clean+closed through this route. Commits only when the day is clean;
   * a refused/skipped day rolls back completely (the executor's own "half-fed day" law) and the
   * report still names exactly what refused, so the source data can be fixed and the day re-run.
   */
  app.post("/api/v1/driver-finance/feed-day/run", WRITE_RL, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!AUTHORITY_ROLES.has(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = runFeedDayBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const b = parsed.data;

    await assertCompanyMembership(user.uuid, b.operating_company_id);

    try {
      const result = await withCurrentUser(user.uuid, async (client: DbClient) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [b.operating_company_id]);

        // THE SEQUENCING LAW: never feed day N+1 on top of an unclosed day N. Write-side only
        // (see module header) — the reconciliation gate (verify-feed-day.mjs) is separate.
        let previousDayCheck: PreviousDayCheck;
        if (b.previous_feed_date) {
          const closed = await isFeedDayClosed(client, b.operating_company_id, b.previous_feed_date);
          if (!closed) {
            throw new FeedDayPreflightError(409, {
              error: "previous_feed_day_not_closed",
              previous_feed_date: b.previous_feed_date,
              message:
                `Day ${b.previous_feed_date} has not landed clean through this route yet. ` +
                `Never ahead of a passing gate — close ${b.previous_feed_date} first, then run ${b.feed_date}.`,
            });
          }
          previousDayCheck = "confirmed_closed";
        } else {
          previousDayCheck = "skipped_no_previous_named";
        }

        // Idempotent by design (the executor's own law), but re-running an ALREADY-closed day
        // through this route is refused outright rather than silently re-executing it — a closed
        // day stays closed; re-opening one is an explicit operator decision (void it first),
        // never a side effect of calling this route twice.
        if (!b.dry_run) {
          const alreadyClosed = await isFeedDayClosed(client, b.operating_company_id, b.feed_date);
          if (alreadyClosed) {
            throw new FeedDayPreflightError(409, {
              error: "feed_day_already_closed",
              feed_date: b.feed_date,
              message: `Day ${b.feed_date} is already closed. Void it first if it must be re-fed.`,
            });
          }
        }

        const input: FeedDayInput = {
          operating_company_id: b.operating_company_id,
          feed_date: b.feed_date,
          source_document_ref: b.source_document_ref,
          actor_user_id: user.uuid,
          stop_on_first_refusal: b.stop_on_first_refusal,
          dry_run: b.dry_run,
          loads: b.loads.map(
            (l): FeedDayLoadPlan => ({
              load_id: l.load_id,
              load_number: l.load_number,
              driver_id: l.driver_id,
              team_driver_id: l.team_driver_id ?? null,
              driver_bill: l.driver_bill,
              escrow_holds: l.escrow_holds,
              fuel_transaction_ids: l.fuel_transaction_ids,
            })
          ),
        };
        const report = await executeHistoricalFeedDay(client, input);

        if (!report.clean || report.dry_run) {
          // Force ROLLBACK via withCurrentUser's own catch — a half-fed or preview day must
          // never persist. The report itself (with every refusal named) travels on the thrown
          // error so the route can still answer with it below.
          throw new FeedDayNotCleanError(report, previousDayCheck);
        }

        await appendCrudAudit(
          client,
          user.uuid,
          FEED_DAY_CLOSED_EVENT_CLASS,
          {
            operating_company_id: b.operating_company_id,
            feed_date: b.feed_date,
            source_document_ref: b.source_document_ref,
            loads_planned: report.loads_planned,
            created: report.created,
            already_existed: report.already_existed,
            previous_feed_date: b.previous_feed_date ?? null,
          },
          "info",
          "FEED-DAY-EXECUTOR-ROUTE"
        );

        // Normal return -> withCurrentUser COMMITs for real.
        return { report, previous_day_check: previousDayCheck };
      });

      return reply.code(200).send(result);
    } catch (err) {
      if (err instanceof FeedDayPreflightError) {
        return reply.code(err.status).send(err.payload);
      }
      if (err instanceof FeedDayNotCleanError) {
        // The transaction already rolled back (withCurrentUser's own catch, forced by this
        // throw). 422 — the request was well-formed, the day just is not clean (or was a dry
        // run, which never commits by design); the report names exactly why.
        return reply.code(422).send({ report: err.report, previous_day_check: err.previousDayCheck });
      }
      throw err;
    }
  });
}
