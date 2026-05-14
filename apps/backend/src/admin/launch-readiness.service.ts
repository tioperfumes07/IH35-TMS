import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { withLuciaBypass } from "../auth/db.js";

const MIGRATION_FILE_PATTERN = /^\d{4}[a-z]?_.+\.sql$/i;

export type LaunchStatusLevel = "green" | "yellow" | "red";

export type LaunchTile = {
  status: LaunchStatusLevel;
  detail: string;
};

export type LaunchReadinessPayload = {
  generated_at: string;
  system_status: {
    api_healthcheck: LaunchTile;
    qbo_sync_worker: LaunchTile;
    qbo_outbox_dispatcher: LaunchTile;
    scheduled_reports_worker: LaunchTile;
    plaid: LaunchTile;
    email_queue: LaunchTile;
    whatsapp: LaunchTile;
  };
  migrations: {
    applied_count: number;
    pending_count: number;
    pending_filenames: string[];
    checksum_mismatch_count: number;
  };
  master_counts: {
    drivers_active: number;
    units_active: number;
    customers: number;
    vendors: number;
    bank_accounts_plaid_linked: number;
    loads_last_30_days: number;
    bank_transactions_last_30_days: number;
  };
  critical_workflows: {
    settlements_last_30_days: number;
    settlements_workflow: LaunchTile;
    settlement_disputes_open: number;
    settlement_disputes_workflow: LaunchTile;
    cash_advances_pending_owner_approval: number;
    cash_advances_workflow: LaunchTile;
    qbo_sync_errors_unresolved: number;
    qbo_sync_errors_workflow: LaunchTile;
  };
  errors?: string[];
};

function repoRootFromHere() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

function migrationDiskFiles(repoRoot: string): string[] {
  const dir = path.join(repoRoot, "db", "migrations");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => MIGRATION_FILE_PATTERN.test(name)).sort();
}

function minutesAgo(iso: Date | string | null): number | null {
  if (!iso) return null;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return null;
  return (Date.now() - ms) / 60000;
}

function workerEnabled(envVal: string | undefined): boolean {
  return envVal !== "false";
}

async function singleRow<T extends Record<string, unknown>>(
  client: PoolClient,
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const res = await client.query<T>(sql, params);
  return (res.rows[0] as T) ?? null;
}

export async function buildLaunchReadinessPayload(): Promise<LaunchReadinessPayload> {
  const errors: string[] = [];
  const repoRoot = repoRootFromHere();
  const diskMigrations = migrationDiskFiles(repoRoot);

  const scheduledIntervalMs = Math.max(
    5000,
    Number(process.env.SCHEDULED_REPORTS_WORKER_INTERVAL_MS ?? "60000") || 60000
  );
  const scheduledStaleMs = scheduledIntervalMs * 2;

  const qboSyncEnabled = workerEnabled(process.env.ENABLE_QBO_SYNC_RUN_WORKER);
  const outboxEnabled = workerEnabled(process.env.ENABLE_QBO_OUTBOX_DISPATCHER);
  const schedEnabled = workerEnabled(process.env.ENABLE_SCHEDULED_REPORTS_WORKER);

  const api_healthcheck: LaunchTile = {
    status: "green",
    detail: "GET /api/v1/_healthcheck returns 200 from this API process",
  };

  const plaidEnv = (process.env.PLAID_ENV ?? "").trim().toLowerCase();
  const whatsappVerified = process.env.WHATSAPP_BUSINESS_VERIFIED === "true";

  return await withLuciaBypass(async (client) => {
    let appliedCount = 0;
    let pendingFiles: string[] = [];
    let checksumMismatches = 0;

    try {
      const reg = await client.query(`SELECT to_regclass('_system._schema_migrations') IS NOT NULL AS ok`);
      if (reg.rows[0]?.ok) {
        const appliedRes = await client.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM _system._schema_migrations`
        );
        appliedCount = Number(appliedRes.rows[0]?.c ?? 0);

        const ledgerRes = await client.query<{ filename: string; checksum: string }>(
          `SELECT filename, checksum FROM _system._schema_migrations`
        );
        const ledger = new Map(ledgerRes.rows.map((r) => [r.filename, r.checksum]));

        const diskChecksums = new Map<string, string>();
        for (const file of diskMigrations) {
          const full = path.join(repoRoot, "db", "migrations", file);
          const body = fs.readFileSync(full, "utf8");
          const checksum = crypto.createHash("sha256").update(body, "utf8").digest("hex");
          diskChecksums.set(file, checksum);
        }

        pendingFiles = [];
        for (const file of diskMigrations) {
          const ledgerSum = ledger.get(file);
          const diskSum = diskChecksums.get(file);
          if (!ledgerSum) {
            pendingFiles.push(file);
            continue;
          }
          if (diskSum && diskSum !== ledgerSum) checksumMismatches += 1;
        }
      } else {
        pendingFiles = [...diskMigrations];
      }
    } catch (e) {
      errors.push(`migrations: ${String((e as Error)?.message ?? e)}`);
    }

    let qbo_sync_worker: LaunchTile = { status: "red", detail: "not evaluated" };
    try {
      const reg = await client.query(`SELECT to_regclass('qbo.sync_runs') IS NOT NULL AS ok`);
      if (!reg.rows[0]?.ok) {
        qbo_sync_worker = { status: "yellow", detail: "qbo.sync_runs table missing" };
      } else if (!qboSyncEnabled) {
        qbo_sync_worker = { status: "red", detail: "ENABLE_QBO_SYNC_RUN_WORKER is false" };
      } else {
        const row = await singleRow<{ last: string | null }>(
          client,
          `SELECT MAX(completed_at)::text AS last FROM qbo.sync_runs WHERE completed_at IS NOT NULL`
        );
        const mins = minutesAgo(row?.last ?? null);
        if (mins === null) {
          qbo_sync_worker = { status: "yellow", detail: "No completed sync runs yet (worker enabled)" };
        } else if (mins <= 5) {
          qbo_sync_worker = { status: "green", detail: `Last completed sync ${mins.toFixed(1)} min ago` };
        } else {
          qbo_sync_worker = { status: "red", detail: `Last completed sync ${mins.toFixed(1)} min ago (>5m)` };
        }
      }
    } catch (e) {
      qbo_sync_worker = { status: "red", detail: String((e as Error)?.message ?? e) };
    }

    const qbo_outbox_dispatcher: LaunchTile = outboxEnabled
      ? { status: "green", detail: "ENABLE_QBO_OUTBOX_DISPATCHER active (not false)" }
      : { status: "red", detail: "ENABLE_QBO_OUTBOX_DISPATCHER is false" };

    let scheduled_reports_worker: LaunchTile = { status: "red", detail: "not evaluated" };
    try {
      const reg = await client.query(`SELECT to_regclass('reporting.scheduled_report_runs') IS NOT NULL AS ok`);
      if (!reg.rows[0]?.ok) {
        scheduled_reports_worker = { status: "yellow", detail: "reporting.scheduled_report_runs missing" };
      } else if (!schedEnabled) {
        scheduled_reports_worker = { status: "red", detail: "ENABLE_SCHEDULED_REPORTS_WORKER is false" };
      } else {
        const row = await singleRow<{ last: string | null }>(
          client,
          `SELECT MAX(run_at)::text AS last FROM reporting.scheduled_report_runs`
        );
        const mins = minutesAgo(row?.last ?? null);
        const threshMin = scheduledStaleMs / 60000;
        if (mins === null) {
          scheduled_reports_worker = {
            status: "yellow",
            detail: "Worker enabled — no scheduled_report_runs rows yet",
          };
        } else if (mins <= threshMin) {
          scheduled_reports_worker = { status: "green", detail: `Last run ${mins.toFixed(1)} min ago` };
        } else {
          scheduled_reports_worker = {
            status: "red",
            detail: `Last run ${mins.toFixed(1)} min ago (stale > ${threshMin.toFixed(1)} min)`,
          };
        }
      }
    } catch (e) {
      scheduled_reports_worker = { status: "red", detail: String((e as Error)?.message ?? e) };
    }

    let plaid: LaunchTile = { status: "yellow", detail: "not evaluated" };
    try {
      const reg = await client.query(`SELECT to_regclass('banking.bank_accounts') IS NOT NULL AS ok`);
      if (!reg.rows[0]?.ok) {
        plaid = { status: "yellow", detail: "banking.bank_accounts missing" };
      } else {
        const row = await singleRow<{ c: string }>(
          client,
          `
            SELECT COUNT(*)::text AS c
            FROM banking.bank_accounts
            WHERE plaid_item_id IS NOT NULL
              AND TRIM(plaid_item_id) <> ''
              AND COALESCE(is_active, true) = true
          `
        );
        const n = Number(row?.c ?? 0);
        if (plaidEnv === "production" && n > 0) {
          plaid = { status: "green", detail: `PLAID_ENV production · ${n} linked account(s)` };
        } else if (plaidEnv === "production" && n === 0) {
          plaid = { status: "red", detail: "PLAID_ENV production but no linked Plaid items" };
        } else if (!plaidEnv) {
          plaid = { status: "yellow", detail: "PLAID_ENV unset" };
        } else {
          plaid = { status: "red", detail: `PLAID_ENV=${plaidEnv} (not production)` };
        }
      }
    } catch (e) {
      plaid = { status: "red", detail: String((e as Error)?.message ?? e) };
    }

    let email_queue: LaunchTile = { status: "red", detail: "not evaluated" };
    try {
      const reg = await client.query(`SELECT to_regclass('email.email_queue') IS NOT NULL AS ok`);
      if (!reg.rows[0]?.ok) {
        email_queue = { status: "yellow", detail: "email.email_queue missing" };
      } else {
        const row = await singleRow<{ last: string | null }>(
          client,
          `
            SELECT MAX(COALESCE(sent_at, updated_at))::text AS last
            FROM email.email_queue
            WHERE status IN ('sent','failed','sending')
          `
        );
        const mins = minutesAgo(row?.last ?? null);
        if (mins === null) {
          email_queue = { status: "yellow", detail: "No outbound email deliveries recorded yet" };
        } else if (mins <= 5) {
          email_queue = { status: "green", detail: `Last delivery activity ${mins.toFixed(1)} min ago` };
        } else {
          email_queue = { status: "red", detail: `No delivery activity within 5m (${mins.toFixed(1)} min ago)` };
        }
      }
    } catch (e) {
      email_queue = { status: "red", detail: String((e as Error)?.message ?? e) };
    }

    const whatsapp: LaunchTile = whatsappVerified
      ? { status: "green", detail: "WHATSAPP_BUSINESS_VERIFIED=true" }
      : { status: "yellow", detail: "Meta WhatsApp verification pending (set WHATSAPP_BUSINESS_VERIFIED=true when live)" };

    const safeCount = async (sql: string): Promise<number> => {
      try {
        const row = await singleRow<{ c: string }>(client, sql);
        return Number(row?.c ?? 0);
      } catch {
        return 0;
      }
    };

    const drivers_active = await safeCount(
      `SELECT COUNT(*)::text AS c FROM mdata.drivers WHERE status = 'Active' AND deactivated_at IS NULL`
    );
    const units_active = await safeCount(
      `SELECT COUNT(*)::text AS c FROM mdata.units WHERE status = 'InService' AND deactivated_at IS NULL`
    );
    const customers = await safeCount(`SELECT COUNT(*)::text AS c FROM mdata.customers`);
    const vendors = await safeCount(`SELECT COUNT(*)::text AS c FROM mdata.vendors`);

    const bank_accounts_plaid_linked = await safeCount(
      `
        SELECT COUNT(*)::text AS c
        FROM banking.bank_accounts
        WHERE plaid_item_id IS NOT NULL AND TRIM(plaid_item_id) <> ''
          AND COALESCE(is_active, true) = true
      `
    );

    const loads_last_30_days = await safeCount(
      `
        SELECT COUNT(*)::text AS c
        FROM mdata.loads
        WHERE created_at >= now() - interval '30 days'
          AND soft_deleted_at IS NULL
      `
    );

    const bank_transactions_last_30_days = await safeCount(
      `
        SELECT COUNT(*)::text AS c
        FROM banking.bank_transactions
        WHERE created_at >= now() - interval '30 days'
      `
    );

    let settlements_last_30_days = 0;
    try {
      const reg = await client.query(`SELECT to_regclass('driver_finance.driver_settlements') IS NOT NULL AS ok`);
      if (reg.rows[0]?.ok) {
        const row = await singleRow<{ c: string }>(
          client,
          `
            SELECT COUNT(*)::text AS c
            FROM driver_finance.driver_settlements
            WHERE created_at >= now() - interval '30 days'
          `
        );
        settlements_last_30_days = Number(row?.c ?? 0);
      }
    } catch {
      settlements_last_30_days = 0;
    }

    let settlement_disputes_open = 0;
    try {
      const reg = await client.query(`SELECT to_regclass('driver_finance.settlement_disputes') IS NOT NULL AS ok`);
      if (reg.rows[0]?.ok) {
        const row = await singleRow<{ c: string }>(
          client,
          `
            SELECT COUNT(*)::text AS c
            FROM driver_finance.settlement_disputes
            WHERE status IN ('submitted','under_review')
          `
        );
        settlement_disputes_open = Number(row?.c ?? 0);
      }
    } catch {
      settlement_disputes_open = 0;
    }

    let cash_advances_pending_owner_approval = 0;
    try {
      const reg = await client.query(`SELECT to_regclass('driver_finance.cash_advance_requests') IS NOT NULL AS ok`);
      if (reg.rows[0]?.ok) {
        const row = await singleRow<{ c: string }>(
          client,
          `
            SELECT COUNT(*)::text AS c
            FROM driver_finance.cash_advance_requests
            WHERE COALESCE(owner_approval_required, false) = true
              AND status IN ('pending','under_review')
          `
        );
        cash_advances_pending_owner_approval = Number(row?.c ?? 0);
      }
    } catch {
      cash_advances_pending_owner_approval = 0;
    }

    let qbo_sync_errors_unresolved = 0;
    try {
      const reg = await client.query(`SELECT to_regclass('qbo.sync_alerts') IS NOT NULL AS ok`);
      if (reg.rows[0]?.ok) {
        const row = await singleRow<{ c: string }>(
          client,
          `SELECT COUNT(*)::text AS c FROM qbo.sync_alerts WHERE resolved_at IS NULL`
        );
        qbo_sync_errors_unresolved = Number(row?.c ?? 0);
      }
    } catch {
      qbo_sync_errors_unresolved = 0;
    }

    const settlements_workflow: LaunchTile =
      settlements_last_30_days > 0
        ? { status: "green", detail: `${settlements_last_30_days} settlements (30d)` }
        : { status: "red", detail: "No settlements in last 30 days" };

    const settlement_disputes_workflow: LaunchTile =
      settlement_disputes_open === 0
        ? { status: "green", detail: "No open disputes" }
        : { status: "yellow", detail: `${settlement_disputes_open} open (triage)` };

    const cash_advances_workflow: LaunchTile =
      cash_advances_pending_owner_approval > 0
        ? { status: "red", detail: `${cash_advances_pending_owner_approval} awaiting owner` }
        : { status: "green", detail: "No pending owner approvals" };

    const qbo_sync_errors_workflow: LaunchTile =
      qbo_sync_errors_unresolved === 0
        ? { status: "green", detail: "No unresolved QBO sync alerts" }
        : { status: "red", detail: `${qbo_sync_errors_unresolved} unresolved` };

    const payload: LaunchReadinessPayload = {
      generated_at: new Date().toISOString(),
      system_status: {
        api_healthcheck,
        qbo_sync_worker,
        qbo_outbox_dispatcher,
        scheduled_reports_worker,
        plaid,
        email_queue,
        whatsapp,
      },
      migrations: {
        applied_count: appliedCount,
        pending_count: pendingFiles.length,
        pending_filenames: pendingFiles,
        checksum_mismatch_count: checksumMismatches,
      },
      master_counts: {
        drivers_active,
        units_active,
        customers,
        vendors,
        bank_accounts_plaid_linked,
        loads_last_30_days,
        bank_transactions_last_30_days,
      },
      critical_workflows: {
        settlements_last_30_days,
        settlements_workflow,
        settlement_disputes_open,
        settlement_disputes_workflow,
        cash_advances_pending_owner_approval,
        cash_advances_workflow,
        qbo_sync_errors_unresolved,
        qbo_sync_errors_workflow,
      },
    };

    if (errors.length > 0) payload.errors = errors;
    return payload;
  });
}
