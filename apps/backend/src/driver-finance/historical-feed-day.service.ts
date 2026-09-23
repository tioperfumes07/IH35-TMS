/**
 * THE FEED DAY EXECUTOR — one day, in order, with a gate, re-runnable after a void.
 *
 * WHAT WAS MISSING. `run_feed_day.py` plans a day and, by its own design note, "writes nothing
 * itself — the app's real create path executes this plan." Until now there was no such path for
 * the driver side: `createHistoricalDriverBill` (FEED-DRIVER-BILL-01),
 * `createExpenseFromFuelTransaction` (FUEL-EXPENSE-DOC-01) and CC-3's
 * `createHistoricalEscrowHold` each existed alone, with nothing sequencing them, nothing
 * enforcing their dependency order, and nothing able to say at the end of a day whether the day
 * was clean. A plan nobody can execute is not a feed.
 *
 * THE OWNER'S OWN RULE IS THE DESIGN: **one day, one proof, one gate. Never ahead of a passing
 * gate.** So this executes exactly one day and stops. It does not loop over the 29 days, because
 * a loop is how day 7 gets fed on top of an unreconciled day 6 and nobody notices until the
 * totals are wrong by an amount nobody can attribute.
 *
 * ORDER IS NOT COSMETIC. Escrow depends on the driver bill existing — CC-3's writer declares
 * `STEPS["escrow"].needs = ["driver_bill"]`. Fuel is independent of both. The order here is the
 * dependency order, and a step whose dependency refused is SKIPPED with that reason recorded,
 * never attempted anyway.
 *
 * FOUR THINGS IT WILL NOT DO
 *   1. It will not post. Every writer it calls creates a DOCUMENT. Posting stays with the
 *      existing engines, so no new GL math enters the system through this path.
 *   2. It will not continue past a refusal in `stopOnFirstRefusal` mode (the default for a real
 *      feed day). A refusal means the source data disagrees with itself; feeding the rest of the
 *      day on top of that is how a reconciliation becomes unexplainable.
 *   3. It will not swallow anything. Every refusal is returned with its reason and the natural
 *      key it refused on. A silent skip is worse than a stop.
 *   4. It will not write outside one transaction. The caller opens it; either the whole day
 *      lands or none of it does, so a half-fed day cannot exist for someone to re-run on top of.
 *
 * IDEMPOTENT END TO END, because every writer underneath is idempotent on its own natural key.
 * Re-running a day after a void produces the same documents, not a second set. That is what
 * makes "void the day, fix the source, feed it again" a real operation rather than a hope.
 */

import { createHistoricalDriverBill } from "./historical-driver-bill-backfill.service.js";
import { createHistoricalEscrowHold } from "./historical-escrow-backfill.service.js";
import { createExpenseFromFuelTransaction } from "../fuel/fuel-expense-document.service.js";

export type QueryableClient = {
  query: <T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** One load's worth of a settlement day, as the planner emits it. */
export type FeedDayLoadPlan = {
  load_id: string;
  load_number: string;
  driver_id: string;
  team_driver_id?: string | null;

  /** Driver bill — the gross the signed settlement states. Omit the whole object when the
   *  document carries no pay lines for this load (load 13588 is real: escrow, no pay). */
  driver_bill?: {
    gross_amount_cents: number;
    loaded_pay_cents?: number | null;
    deadhead_pay_cents?: number | null;
    miles_basis?: number | null;
    miles_basis_type?: "short" | "practical" | null;
    rate_per_mile_cents?: number | null;
    miles_deadhead?: number | null;
    rate_empty_per_mile_cents?: number | null;
  };

  /** Escrow holds this load's settlement lines create. Positive magnitudes; the writer signs. */
  escrow_holds?: Array<{ description: string; amount_cents: number }>;

  /** Fuel purchases to give documents to, by fuel transaction id. */
  fuel_transaction_ids?: string[];
};

export type FeedDayInput = {
  operating_company_id: string;
  /** The settlement day being fed, ISO yyyy-mm-dd. Recorded on every step of the report. */
  feed_date: string;
  /** The source settlement document(s) this day is rebuilt from. */
  source_document_ref: string;
  loads: FeedDayLoadPlan[];
  actor_user_id: string;
  /** Default true. A real feed day stops at the first refusal. */
  stop_on_first_refusal?: boolean;
  /** Validate and report without writing. */
  dry_run?: boolean;
};

export type FeedStepResult = {
  step: "driver_bill" | "escrow" | "fuel_expense";
  load_id: string;
  load_number: string;
  natural_key: string;
  status: "created" | "already_exists" | "refused" | "skipped_dependency" | "would_create";
  detail: string;
};

export type FeedDayReport = {
  feed_date: string;
  source_document_ref: string;
  dry_run: boolean;
  loads_planned: number;
  created: number;
  already_existed: number;
  refused: number;
  skipped: number;
  /** TRUE only when nothing refused and nothing was skipped for a failed dependency. The gate
   *  reads this and nothing else. A day is clean or it is not; there is no partial credit. */
  clean: boolean;
  steps: FeedStepResult[];
};

/**
 * Execute one settlement day. Returns a report; never throws for a business refusal.
 * The CALLER owns the transaction — open it, call this, and COMMIT only when `clean` is true.
 */
export async function executeHistoricalFeedDay(
  client: QueryableClient,
  input: FeedDayInput,
): Promise<FeedDayReport> {
  const stopOnFirstRefusal = input.stop_on_first_refusal !== false;
  const dryRun = input.dry_run === true;
  const steps: FeedStepResult[] = [];

  const push = (s: FeedStepResult) => {
    steps.push(s);
    return s;
  };

  outer: for (const load of input.loads) {
    // ---- STEP 1. DRIVER BILL. Escrow depends on it, so it goes first. ---------------------
    let driverBillOk = true;
    if (load.driver_bill) {
      const key = `${load.load_number}/${load.driver_id}`;
      if (dryRun) {
        push({
          step: "driver_bill", load_id: load.load_id, load_number: load.load_number,
          natural_key: key, status: "would_create",
          detail: `gross ${load.driver_bill.gross_amount_cents} cents as printed`,
        });
      } else {
        const r = await createHistoricalDriverBill(client, {
          operating_company_id: input.operating_company_id,
          load_id: load.load_id,
          load_number: load.load_number,
          driver_id: load.driver_id,
          team_driver_id: load.team_driver_id ?? null,
          gross_amount_cents: load.driver_bill.gross_amount_cents,
          loaded_pay_cents: load.driver_bill.loaded_pay_cents ?? null,
          deadhead_pay_cents: load.driver_bill.deadhead_pay_cents ?? null,
          miles_basis: load.driver_bill.miles_basis ?? null,
          miles_basis_type: load.driver_bill.miles_basis_type ?? null,
          rate_per_mile_cents: load.driver_bill.rate_per_mile_cents ?? null,
          miles_deadhead: load.driver_bill.miles_deadhead ?? null,
          rate_empty_per_mile_cents: load.driver_bill.rate_empty_per_mile_cents ?? null,
          source_document_ref: input.source_document_ref,
          requesting_user_uuid: input.actor_user_id,
        });
        if (r.outcome === "refused") {
          driverBillOk = false;
          push({
            step: "driver_bill", load_id: load.load_id, load_number: load.load_number,
            natural_key: key, status: "refused", detail: r.reason,
          });
          if (stopOnFirstRefusal) break outer;
        } else {
          push({
            step: "driver_bill", load_id: load.load_id, load_number: load.load_number,
            natural_key: key,
            status: r.outcome === "created" ? "created" : "already_exists",
            detail: `bill ${r.bill_number}`,
          });
        }
      }
    }

    // ---- STEP 2. ESCROW. Needs the driver bill. A load can carry escrow and no pay lines. --
    for (const hold of load.escrow_holds ?? []) {
      const key = `${load.load_number}/${load.driver_id}/${hold.description}`;
      if (!driverBillOk) {
        push({
          step: "escrow", load_id: load.load_id, load_number: load.load_number,
          natural_key: key, status: "skipped_dependency",
          detail: "driver bill refused on this load; escrow depends on it and was not attempted",
        });
        continue;
      }
      if (dryRun) {
        push({
          step: "escrow", load_id: load.load_id, load_number: load.load_number,
          natural_key: key, status: "would_create",
          detail: `${hold.amount_cents} cents, sign derived by the writer`,
        });
        continue;
      }
      try {
        const r = await createHistoricalEscrowHold(client, {
          source: "historical_backfill",
          operating_company_id: input.operating_company_id,
          driver_id: load.driver_id,
          load_id: load.load_id,
          description: hold.description,
          amount_cents: hold.amount_cents,
          actor_user_id: input.actor_user_id,
        });
        push({
          step: "escrow", load_id: load.load_id, load_number: load.load_number,
          natural_key: key,
          status: r.outcome === "created" ? "created" : "already_exists",
          detail: `escrow_ledger ${r.escrow_ledger_id}`,
        });
      } catch (err) {
        // That writer throws on a contract violation by design. A thrown contract violation is
        // a refusal for this day, reported with its own words — not re-raised into a 500 that
        // loses which load and which line it happened on.
        push({
          step: "escrow", load_id: load.load_id, load_number: load.load_number,
          natural_key: key, status: "refused",
          detail: err instanceof Error ? err.message : String(err),
        });
        if (stopOnFirstRefusal) break outer;
      }
    }

    // ---- STEP 3. FUEL. Independent of both; a fuel document stands on its own. -------------
    for (const fuelId of load.fuel_transaction_ids ?? []) {
      const key = `${load.load_number}/fuel/${fuelId}`;
      const r = await createExpenseFromFuelTransaction(client, {
        operating_company_id: input.operating_company_id,
        fuel_transaction_id: fuelId,
        requesting_user_uuid: input.actor_user_id,
        dry_run: dryRun,
      });
      if (r.outcome === "refused") {
        push({
          step: "fuel_expense", load_id: load.load_id, load_number: load.load_number,
          natural_key: key, status: "refused", detail: r.reason,
        });
        if (stopOnFirstRefusal) break outer;
      } else if (r.outcome === "would_create") {
        push({
          step: "fuel_expense", load_id: load.load_id, load_number: load.load_number,
          natural_key: key, status: "would_create", detail: `${r.amount_cents} cents`,
        });
      } else {
        push({
          step: "fuel_expense", load_id: load.load_id, load_number: load.load_number,
          natural_key: key,
          status: r.outcome === "created" ? "created" : "already_exists",
          // Both remaining variants carry expense_id and expense_number; the number is the
          // human-facing identifier, the id is the fallback when a legacy row has none.
          detail: `expense ${r.expense_number ?? r.expense_id}`,
        });
      }
    }
  }

  const created = steps.filter((s) => s.status === "created").length;
  const alreadyExisted = steps.filter((s) => s.status === "already_exists").length;
  const refused = steps.filter((s) => s.status === "refused").length;
  const skipped = steps.filter((s) => s.status === "skipped_dependency").length;

  return {
    feed_date: input.feed_date,
    source_document_ref: input.source_document_ref,
    dry_run: dryRun,
    loads_planned: input.loads.length,
    created,
    already_existed: alreadyExisted,
    refused,
    skipped,
    // The gate reads this and nothing else.
    clean: refused === 0 && skipped === 0,
    steps,
  };
}
