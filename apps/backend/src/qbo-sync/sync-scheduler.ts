import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import * as Sentry from "@sentry/node";
import { withLuciaBypass } from "../auth/db.js";
import { recordBackgroundJobRun, wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { pullChartOfAccountsFromQbo } from "./chart-of-accounts-puller.js";
import { reconcileChartOfAccounts } from "./chart-of-accounts-reconciler.js";
import { pullItemsFromQbo } from "./items-puller.js";
import { reconcileItems } from "./items-reconciler.js";
import { pullApBillsFromQbo, projectApBillsToLedger } from "./ap-bills-puller.js";
import { pullApBillPaymentsFromQbo, projectApBillPaymentsToLedger } from "./ap-bill-payments-puller.js";
import { pullPurchasesFromQbo, projectPurchasesToExpenses } from "./qbo-purchases-puller.js";
import { pullVendorCreditsFromQbo, projectVendorCreditsToLedger } from "./qbo-vendor-credits-puller.js";
import { pullArInvoicesFromQbo, projectArInvoicesToLedger } from "./qbo-ar-invoices-puller.js";
import { pullArPaymentsFromQbo, projectArPaymentsToLedger } from "./qbo-ar-payments-puller.js";
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
  await runStep("chart_of_accounts_pull", operatingCompanyId, () => pullChartOfAccountsFromQbo(operatingCompanyId), failures, log);
  await runStep("chart_of_accounts_reconcile", operatingCompanyId, () => reconcileChartOfAccounts(operatingCompanyId), failures, log);

  await runStep("items_pull", operatingCompanyId, () => pullItemsFromQbo(operatingCompanyId), failures, log);
  await runStep("items_reconcile", operatingCompanyId, () => reconcileItems(operatingCompanyId), failures, log);

  const customersPull = await loadOptionalFn("./customers-puller.js", "pullCustomersFromQbo");
  if (customersPull) await runStep("customers_pull", operatingCompanyId, () => customersPull(operatingCompanyId), failures, log);
  const customersReconcile = await loadOptionalFn("./customers-reconciler.js", "reconcileCustomers");
  if (customersReconcile) await runStep("customers_reconcile", operatingCompanyId, () => customersReconcile(operatingCompanyId), failures, log);

  const vendorsPull = await loadOptionalFn("./vendors-puller.js", "pullVendorsFromQbo");
  if (vendorsPull) await runStep("vendors_pull", operatingCompanyId, () => vendorsPull(operatingCompanyId), failures, log);
  const vendorsReconcile = await loadOptionalFn("./vendors-reconciler.js", "reconcileVendors");
  if (vendorsReconcile) await runStep("vendors_reconcile", operatingCompanyId, () => vendorsReconcile(operatingCompanyId), failures, log);

  // Inbound A/P (QBO Bills -> mdata.qbo_ap_bills mirror -> accounting.bills + bill_lines). MUST run even if
  // an earlier step failed — that isolation IS the A/P-shows-$0 / bill_lines≈1 fix. Both stages are
  // internally gated by default-OFF flags (QBO_AP_MIRROR_PULL_ENABLED / QBO_AP_BILLS_PROJECTION_ENABLED)
  // and idempotent (header upsert / incremental line upsert + orphan-delete), so re-running is safe.
  // NO GL poster on this path.
  await runStep("ap_bills_pull", operatingCompanyId, () => pullApBillsFromQbo(operatingCompanyId), failures, log);
  await runStep("ap_bills_project", operatingCompanyId, async () => {
    const res = await projectApBillsToLedger(operatingCompanyId);
    log?.info(
      {
        operating_company_id: operatingCompanyId,
        enabled: res.enabled,
        rows_projected: res.rowsProjected,
        lines_projected: res.lines.linesProjected,
        lines_orphan_deleted: res.lines.linesOrphanDeleted,
        lines_unmapped_account: res.lines.linesUnmappedAccount,
        lines_unmapped_item: res.lines.linesUnmappedItem,
        header_line_sum_mismatch: res.lines.headerLineSumMismatch,
      },
      "[qbo-sync-scheduler] ap_bills_project complete (headers + incremental lines from payload_json)"
    );
    return res;
  }, failures, log);

  // Inbound A/P PAYMENTS (QBO BillPayment -> mdata.qbo_ap_bill_payments mirror -> accounting.bill_payments).
  // MUST run AFTER ap_bills_project so the bills the payments link to are already projected (a payment whose
  // bill isn't projected yet is left in the mirror as paymentsUnlinked, never invented). Both stages are
  // internally gated by default-OFF flags (QBO_AP_BILL_PAYMENT_MIRROR_PULL_ENABLED /
  // QBO_AP_BILL_PAYMENTS_PROJECTION_ENABLED) and idempotent (upsert), so re-running is safe. NO GL poster.
  await runStep("ap_bill_payments_pull", operatingCompanyId, () => pullApBillPaymentsFromQbo(operatingCompanyId), failures, log);
  await runStep("ap_bill_payments_project", operatingCompanyId, async () => {
    const res = await projectApBillPaymentsToLedger(operatingCompanyId);
    log?.info(
      {
        operating_company_id: operatingCompanyId,
        enabled: res.enabled,
        rows_projected: res.rowsProjected,
        payments_unlinked: res.paymentsUnlinked,
      },
      "[qbo-sync-scheduler] ap_bill_payments_project complete (fan-out BillPayment -> bill_payments allocations)"
    );
    return res;
  }, failures, log);

  // Inbound QBO Purchases (cash/card spend) -> mdata.qbo_purchases mirror -> accounting.expenses + expense_lines.
  // ISOLATED like the A/P stages: MUST run even if an earlier step failed (so a transient COA/items/AP blip
  // never silently skips the expense clone). Both stages are internally gated by default-OFF flags
  // (QBO_PURCHASES_MIRROR_PULL_ENABLED / QBO_EXPENSES_PROJECTION_ENABLED) and idempotent (header upsert /
  // line upsert by (expense_id,line_sequence)). SUBLEDGER ONLY — NO GL poster on this path; the posting
  // engine additionally REFUSES to post qbo-sourced expenses (EXPENSE_POST_GL_REFUSED).
  await runStep("qbo_purchases_pull", operatingCompanyId, () => pullPurchasesFromQbo(operatingCompanyId), failures, log);
  await runStep("qbo_purchases_project", operatingCompanyId, async () => {
    const res = await projectPurchasesToExpenses(operatingCompanyId);
    log?.info(
      {
        operating_company_id: operatingCompanyId,
        enabled: res.enabled,
        expenses_projected: res.expensesProjected,
        lines_projected: res.linesProjected,
      },
      "[qbo-sync-scheduler] qbo_purchases_project complete (expense headers + lines from payload_json)"
    );
    return res;
  }, failures, log);

  // Inbound QBO VendorCredit -> mdata.qbo_vendor_credits mirror -> accounting.vendor_credits.
  // ISOLATED like purchases/AR: MUST run even if an earlier step failed. Both stages gated default-OFF
  // (QBO_VENDOR_CREDIT_MIRROR_PULL_ENABLED / QBO_VENDOR_CREDITS_PROJECTION_ENABLED). SUBLEDGER ONLY — NO GL.
  await runStep("qbo_vendor_credits_pull", operatingCompanyId, () => pullVendorCreditsFromQbo(operatingCompanyId), failures, log);
  await runStep("qbo_vendor_credits_project", operatingCompanyId, async () => {
    const res = await projectVendorCreditsToLedger(operatingCompanyId);
    log?.info(
      {
        operating_company_id: operatingCompanyId,
        enabled: res.enabled,
        credits_projected: res.creditsProjected,
        vendors_unresolved: res.vendorsUnresolved,
      },
      "[qbo-sync-scheduler] qbo_vendor_credits_project complete (vendor credit headers from mirror)"
    );
    return res;
  }, failures, log);

  // Inbound QBO A/R invoices -> mdata.qbo_ar_invoices -> accounting.invoices (qbo_invoice_id).
  // MUST run before ar_payments_project so Stage 2b payment_applications can resolve LinkedTxn Invoice ids.
  // Gated QBO_AR_INVOICE_MIRROR_PULL_ENABLED / QBO_AR_INVOICES_PROJECTION_ENABLED (default OFF; TRANSP
  // armed by 202610191400). SUBLEDGER ONLY — NO GL.
  await runStep("ar_invoices_pull", operatingCompanyId, () => pullArInvoicesFromQbo(operatingCompanyId), failures, log);
  await runStep("ar_invoices_project", operatingCompanyId, async () => {
    const res = await projectArInvoicesToLedger(operatingCompanyId);
    log?.info(
      {
        operating_company_id: operatingCompanyId,
        enabled: res.enabled,
        invoices_projected: res.invoicesProjected,
        customers_unresolved: res.customersUnresolved,
      },
      "[qbo-sync-scheduler] ar_invoices_project complete (invoice headers from mirror; unblocks payment_applications)"
    );
    return res;
  }, failures, log);

  // Inbound QBO A/R receipts (Payment) -> mdata.qbo_ar_payments mirror -> accounting.payments +
  // payment_applications. ISOLATED like the AP/expense stages: MUST run even if an earlier step failed.
  // Both stages are internally gated by default-OFF flags (QBO_AR_PAYMENT_MIRROR_PULL_ENABLED /
  // QBO_AR_PAYMENTS_PROJECTION_ENABLED) and idempotent (header upsert on the existing
  // uq_payments_company_qbo_payment_id; allocation upsert on the existing uq_payment_applications_target).
  // SUBLEDGER ONLY — NO GL poster on this path; the posting engine additionally REFUSES to post
  // qbo-sourced customer payments (QBO_CUSTOMER_PAYMENT_POST_GL_REFUSED). Runs AFTER the AP stages
  // (ap_bills/ap_bill_payments/qbo_purchases) per the AP-side sequencing convention.
  await runStep("ar_payments_pull", operatingCompanyId, () => pullArPaymentsFromQbo(operatingCompanyId), failures, log);
  await runStep("ar_payments_project", operatingCompanyId, async () => {
    const res = await projectArPaymentsToLedger(operatingCompanyId);
    log?.info(
      {
        operating_company_id: operatingCompanyId,
        enabled: res.enabled,
        payments_projected: res.paymentsProjected,
        customers_unresolved: res.customersUnresolved,
        applications_projected: res.applicationsProjected,
        applications_unlinked: res.applicationsUnlinked,
      },
      "[qbo-sync-scheduler] ar_payments_project complete (payment headers + invoice allocations from payload_json)"
    );
    return res;
  }, failures, log);

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
