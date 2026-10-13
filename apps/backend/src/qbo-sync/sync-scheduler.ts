import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import * as Sentry from "@sentry/node";
import { withLuciaBypass } from "../auth/db.js";
import { recordBackgroundJobRun, wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { pullChartOfAccountsFromQbo } from "./chart-of-accounts-puller.js";
import { pullItemsFromQbo } from "./items-puller.js";
import { pullApBillsFromQbo } from "./ap-bills-puller.js";
import { pullApBillPaymentsFromQbo } from "./ap-bill-payments-puller.js";
import { pullPurchasesFromQbo } from "./qbo-purchases-puller.js";
import { pullVendorCreditsFromQbo } from "./qbo-vendor-credits-puller.js";
import { pullArInvoicesFromQbo } from "./qbo-ar-invoices-puller.js";
import { pullArPaymentsFromQbo } from "./qbo-ar-payments-puller.js";
import { countUnresolvedDrift, detectDriftForCompany } from "./drift-detector.js";
import { maybeFireDriftAlert } from "./sync-alerts.js";

let initialized = false;

export type SyncStepFailure = { operating_company_id: string; step: string; error: string };

// B-A2 — per-STEP error isolation + NO SILENT SWALLOW (root cause of "A/P bills = $0 while QBO live + flags
// ON"): the tick ran COA→Items→customers→vendors→A/P as bare awaits, so a transient failure on ANY earlier
// step (a QBO 5xx/429, a token blip) threw out of the whole tick before the A/P stages ran — and
// wrapBackgroundJobTick swallowed it into Sentry, invisible in the UI. Now each step is isolated: a failure
// logs loudly, is captured to Sentry, and is recorded as a FAILED background-job run (health surface). It is
// NEVER swallowed, and it never blocks the remaining steps or later companies. Aggregated failures are
// returned so the caller/route can report them.
async function runStep(
  step: string,
  operatingCompanyId: string,
  fn: () => Promise<unknown>,
  failures: SyncStepFailure[],
  log?: FastifyInstance["log"]
): Promise<void> {
  // ACCT-F79 — a step that SUCCEEDS must record a successful run, not silence.
  //
  // This function previously recorded ONLY the catch path. `recordBackgroundJobRun(step, true)` was
  // never called anywhere in the scheduler, so `_system.background_jobs` could represent a QBO sync
  // step in exactly two states: FAILED, or ABSENT. A green step was structurally unrepresentable.
  //
  // Verified on prod 2026-08-01 — the scoreboard was inverted, and it read as catastrophe:
  //   * 14 of the 20 scheduled steps had NO ROW AT ALL (the whole AR/AP chain: ap_bills_pull/project,
  //     ap_bill_payments_*, ar_invoices_*, ar_payments_*, qbo_vendor_credits_*, plus all three
  //     reconcilers). They were invisible PRECISELY BECAUSE THEY WERE WORKING.
  //   * All 6 steps that did have a row showed last_successful_run_at = NULL — rows are only ever
  //     created by a failure, so that column could never be non-null for any step.
  //   * chart_of_accounts_pull stopped updating after 17:00Z, which read as "died". It had actually
  //     stopped FAILING once the connection filter excluded USMCA, i.e. it began succeeding silently.
  //   * run_count_today was therefore a FAILURE count wearing a run count's name.
  //
  // "8 jobs have never succeeded" was itself a measurement artifact of this defect. An observability
  // surface that can only render red or nothing does not report health — it manufactures alarm and
  // hides the real signal underneath it, which is the same failure mode as expected-state-recorded-
  // as-failure, inverted.
  //
  // The success record is written OUTSIDE the try/catch. If it were inside, a throw from the recorder
  // itself would be caught below and logged as a STEP failure — reporting a step that genuinely
  // succeeded as broken, which is the exact class of dishonesty this fix exists to remove.
  let succeeded = false;
  try {
    await fn();
    succeeded = true;
  } catch (error) {
    const msg = String((error as Error)?.message ?? error);
    failures.push({ operating_company_id: operatingCompanyId, step, error: msg });
    log?.error(
      { operating_company_id: operatingCompanyId, step, err: msg },
      `[qbo-sync-scheduler] step '${step}' FAILED — isolated, continuing with the next step`
    );
    Sentry.captureException(error, {
      tags: { job_name: "qbo_sync.drift_scheduler", step, operating_company_id: operatingCompanyId },
    });
    await recordBackgroundJobRun(`qbo_sync.step.${step}`, false, `${operatingCompanyId}: ${msg}`);
  }
  if (succeeded) await recordBackgroundJobRun(`qbo_sync.step.${step}`, true, null);
}

// Optional puller/reconciler modules (e.g. customers/vendors not yet deployed): a MISSING module is skipped
// silently (import fails), but a module that IS present and THROWS at call time surfaces via runStep — no
// blanket swallow of real errors (the old pullEntityIfModuleExists caught both, hiding real failures).
async function loadOptionalFn(
  modulePath: string,
  exportName: string
): Promise<((id: string) => Promise<unknown>) | null> {
  try {
    const mod = (await import(modulePath)) as Record<string, (id: string) => Promise<unknown>>;
    const fn = mod[exportName];
    return typeof fn === "function" ? fn : null;
  } catch {
    return null; // module not deployed — optional, skip (not an error)
  }
}

async function runScheduledSyncForCompany(
  operatingCompanyId: string,
  failures: SyncStepFailure[],
  log?: FastifyInstance["log"]
): Promise<void> {
  // ACCT-F4431380 (Lead 443.137 item 9e; owner ruling — QuickBooks is a READ-ONLY ARCHIVE, USMCA is the TMS
  // ERP, TRANSPORTATION/TRUCKING are frozen QBO mirrors). The scheduler runs ONLY the mirror pulls below.
  //   OLD: each pull was followed by a *_reconcile step (chart_of_accounts / items / customers / vendors ->
  //        catalogs.accounts / catalogs.items / mdata.customers / mdata.vendors) or a *_project step
  //        (ap_bills / ap_bill_payments / qbo_purchases / qbo_vendor_credits / ar_invoices / ar_payments ->
  //        accounting.bills / bill_lines / bill_payments / expenses / expense_lines / vendor_credits /
  //        invoices / invoice_lines / payments / payment_applications).
  //   NEW: those steps are gone. Their entry points now throw QboNativeWriteRefusedError
  //        (QBO_NATIVE_WRITE_REFUSED); scheduling them would record a refused step every tick, so they are
  //        not scheduled at all. Each pull still fills its own mirror (mdata.qbo_*) and qbo.sync_runs.
  //   WHY: a QBO path must never write a native money or master table. Guard:
  //        scripts/verify-qbo-paths-never-write-native-tables.mjs.
  // Every step stays ISOLATED (B-A2): one pull failing never skips the next.
  await runStep("chart_of_accounts_pull", operatingCompanyId, () => pullChartOfAccountsFromQbo(operatingCompanyId), failures, log);
  await runStep("items_pull", operatingCompanyId, () => pullItemsFromQbo(operatingCompanyId), failures, log);

  const customersPull = await loadOptionalFn("./customers-puller.js", "pullCustomersFromQbo");
  if (customersPull) await runStep("customers_pull", operatingCompanyId, () => customersPull(operatingCompanyId), failures, log);

  const vendorsPull = await loadOptionalFn("./vendors-puller.js", "pullVendorsFromQbo");
  if (vendorsPull) await runStep("vendors_pull", operatingCompanyId, () => vendorsPull(operatingCompanyId), failures, log);

  // Inbound mirrors only. Each pull is internally gated by its default-OFF mirror flag (blocked permanently
  // by migration 202614530000) and idempotent (upsert by qbo_id). NO GL poster, NO native projection.
  await runStep("ap_bills_pull", operatingCompanyId, () => pullApBillsFromQbo(operatingCompanyId), failures, log);
  await runStep("ap_bill_payments_pull", operatingCompanyId, () => pullApBillPaymentsFromQbo(operatingCompanyId), failures, log);
  await runStep("qbo_purchases_pull", operatingCompanyId, () => pullPurchasesFromQbo(operatingCompanyId), failures, log);
  await runStep("qbo_vendor_credits_pull", operatingCompanyId, () => pullVendorCreditsFromQbo(operatingCompanyId), failures, log);
  await runStep("ar_invoices_pull", operatingCompanyId, () => pullArInvoicesFromQbo(operatingCompanyId), failures, log);
  await runStep("ar_payments_pull", operatingCompanyId, () => pullArPaymentsFromQbo(operatingCompanyId), failures, log);

  await runStep(
    "drift_detect",
    operatingCompanyId,
    async () => {
      const driftResults = await detectDriftForCompany(operatingCompanyId);
      for (const result of driftResults) {
        const unresolved = await countUnresolvedDrift(operatingCompanyId, result.entityType);
        const alert = await maybeFireDriftAlert({ operatingCompanyId, entityType: result.entityType, driftCount: unresolved });
        log?.info(
          {
            operating_company_id: operatingCompanyId,
            entity_type: result.entityType,
            inserted: result.inserted,
            unresolved,
            alert_sent: alert.sent,
          },
          "[qbo-sync-scheduler] drift detection complete"
        );
      }
    },
    failures,
    log
  );
}

// Runs one full tick across every active company. Returns the aggregated isolated failures (never throws for
// a per-step/per-company error). Reused by the 4h cron AND the owner-only manual trigger route.
export async function runQboSyncSchedulerTick(log?: FastifyInstance["log"]): Promise<SyncStepFailure[]> {
  const failures: SyncStepFailure[] = [];
  await withLuciaBypass(async (client) => {
    // ACCT-F63 — only companies that actually HAVE a QuickBooks connection are QBO-syncable.
    //
    // This previously iterated every active company, so USMCA — which has NO QuickBooks realm BY
    // DESIGN (it is TMS-authoritative from day one and was never part of the clone) — was asked to
    // pull customers and the chart of accounts on every tick and failed every time with
    // "QBO not authorized for this company. Please authorize via /admin/forensic-review."
    // Verified on prod 2026-08-01: qbo_sync.step.customers_pull and .chart_of_accounts_pull both had
    // last_successful_run_at = NULL with that error against 5c854333-… = USMCA, while
    // integrations.qbo_connections shows LIVE unrevoked connections for TRANSP and TRK only.
    //
    // Absence of a connection is a designed state, not a failure. Recording it as a failed job run
    // every tick is what buried the REAL never-succeeded jobs in the same "stale_jobs" bucket —
    // permanent expected noise is how genuine signal gets ignored.
    //
    // Keyed on the connection, not on a hardcoded USMCA id: if USMCA is ever connected it starts
    // syncing with no code change, and if TRANSP is ever revoked it stops erroring on every tick.
    const companies = await client.query<{ id: string }>(
      `SELECT c.id::text AS id
       FROM org.companies c
       JOIN integrations.qbo_connections q
         ON q.operating_company_id = c.id
        AND q.revoked_at IS NULL
       WHERE c.is_active = true
         AND c.deactivated_at IS NULL
       GROUP BY c.id
       ORDER BY c.id`
    );
    for (const company of companies.rows) {
      // B-A2 — per-COMPANY isolation: TRANSP failing must not block TRK. Every step is already isolated, so
      // runScheduledSyncForCompany should not throw; this outer guard is belt-and-suspenders for anything
      // unexpected (e.g. an error outside a step).
      try {
        await runScheduledSyncForCompany(company.id, failures, log);
      } catch (error) {
        const msg = String((error as Error)?.message ?? error);
        failures.push({ operating_company_id: company.id, step: "company", error: msg });
        log?.error({ operating_company_id: company.id, err: msg }, "[qbo-sync-scheduler] company sync FAILED — isolated, continuing with the next company");
        Sentry.captureException(error, { tags: { job_name: "qbo_sync.drift_scheduler", operating_company_id: company.id } });
        await recordBackgroundJobRun("qbo_sync.company", false, `${company.id}: ${msg}`);
      }
    }
  });
  if (failures.length) {
    log?.warn(
      { failure_count: failures.length, failures },
      "[qbo-sync-scheduler] tick completed WITH isolated step failures (each captured to Sentry + a failed job run; the tick did NOT abort)"
    );
  }
  return failures;
}

export function initializeQboSyncDriftScheduler(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if ((process.env.QBO_DRIFT_SYNC_CRON_ENABLED ?? "true").trim() === "false") {
    app.log.info("QBO drift sync scheduler disabled (QBO_DRIFT_SYNC_CRON_ENABLED=false)");
    return;
  }

  cron.schedule(
    "0 */4 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "qbo_sync.drift_scheduler",
        async () => {
          app.log.info("QBO drift sync scheduler tick (every 4h, America/Chicago)");
          await runQboSyncSchedulerTick(app.log);
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("QBO drift sync scheduler initialized (every 4h America/Chicago)");
}
