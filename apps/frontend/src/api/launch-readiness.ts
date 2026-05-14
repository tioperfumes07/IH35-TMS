import { apiRequest } from "./client";

export type LaunchTile = {
  status: "green" | "yellow" | "red";
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

export async function getLaunchReadiness() {
  return apiRequest<LaunchReadinessPayload>("/api/v1/admin/launch-readiness");
}
