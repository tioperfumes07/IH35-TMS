/**
 * ROUND 443.7 b — AN HONEST RESULT. The Settlement Creator route used to run the factor auto-submit and the billing
 * sync after COMMIT, log any failure and still return ok: true. Every stage is now reported on its own — documents,
 * ledger, factoring submit, billing sync — each ok or failed with its reason in plain English; ok is true only when
 * every required stage succeeded. A failed after-commit stage is stored (audit event
 * driver_finance.settlement_creator.after_commit) with what it needs to run again, and is retryable
 * (POST /api/v1/driver-finance/settlement-creator/:settlementId/retry-after-commit).
 *
 * Factoring: owner law ROUND 315 (2026-10-01) — "the owner creates every purchase report himself in the app";
 * autoSubmitDeliveredLoadToFactor answers factoring_purchase_owner_only, which is the CORRECT outcome (the invoice
 * waits on the Submit Invoice tab), not a failure. Anything else it answers, or throws, is a failure.
 */
import { autoSubmitDeliveredLoadToFactor, AUTO_SUBMIT_REFUSED_REASON } from "../factoring/auto-submit-on-delivery.service.js";
import { syncSettlementLoadsToBilling } from "../dispatch/load-billing-lifecycle.service.js";
import { withCurrentUser } from "../auth/db.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

export type StageResult = { ok: boolean; status: string; message: string };
export type AfterCommitLoad = { load_id: string; load_number: string; factoring: string; delivered: boolean };
export type AfterCommitInput = { operating_company_id: string; settlement_id: string; loads: AfterCommitLoad[] };
export type AfterCommitStages = { factoring: StageResult & { per_load: Array<{ load_number: string; status: string }> }; billing: StageResult };

export type CreatorStages = {
  documents: StageResult;
  ledger: StageResult;
} & AfterCommitStages;

export const AFTER_COMMIT_EVENT = "driver_finance.settlement_creator.after_commit";

export type AfterCommitDeps = {
  submit: typeof autoSubmitDeliveredLoadToFactor;
  sync: typeof syncSettlementLoadsToBilling;
};
const DEFAULT_DEPS: AfterCommitDeps = { submit: autoSubmitDeliveredLoadToFactor, sync: syncSettlementLoadsToBilling };

export async function runCreatorAfterCommit(actorUserId: string, input: AfterCommitInput, deps: AfterCommitDeps = DEFAULT_DEPS): Promise<AfterCommitStages> {
  const perLoad: Array<{ load_number: string; status: string }> = [];
  const failures: string[] = [];
  for (const l of input.loads) {
    if (l.factoring !== "faro_usmca") { perLoad.push({ load_number: l.load_number, status: "not_factored_by_usmca" }); continue; }
    if (!l.delivered) { perLoad.push({ load_number: l.load_number, status: "not_delivered" }); continue; }
    try {
      const r = await deps.submit({ operatingCompanyId: input.operating_company_id, loadId: l.load_id, actorUserId });
      if (r.submitted) perLoad.push({ load_number: l.load_number, status: "submitted" });
      else if (r.reason === AUTO_SUBMIT_REFUSED_REASON) perLoad.push({ load_number: l.load_number, status: "owner_submits" });
      else { perLoad.push({ load_number: l.load_number, status: `failed:${r.reason ?? "unknown"}` }); failures.push(`load ${l.load_number}: ${r.reason ?? "unknown"}`); }
    } catch (err) {
      perLoad.push({ load_number: l.load_number, status: "failed:error" });
      failures.push(`load ${l.load_number}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const factoring = failures.length
    ? { ok: false, status: "failed", message: `Factoring submit failed — ${failures.join("; ")}.`, per_load: perLoad }
    : {
        ok: true,
        status: perLoad.some((p) => p.status === "owner_submits") ? "owner_submits" : "not_required",
        message: perLoad.some((p) => p.status === "owner_submits")
          ? "Faro loads wait on the Submit Invoice tab — the owner submits them."
          : "No load needs a factoring submit.",
        per_load: perLoad,
      };
  let billing: StageResult;
  try {
    const results = await deps.sync({ operatingCompanyId: input.operating_company_id, loadIds: input.loads.map((l) => l.load_id), actorUserId });
    // syncSettlementLoadsToBilling swallows a per-load error as { reason: "error" } — that is a failure, not a pass.
    const errored = input.loads.filter((_, i) => results[i]?.reason === "error").map((l) => l.load_number);
    billing = errored.length
      ? { ok: false, status: "failed", message: `Billing status could not be updated for load${errored.length > 1 ? "s" : ""} ${errored.join(", ")}.` }
      : { ok: true, status: "synced", message: "Load billing status updated." };
  } catch (err) {
    billing = { ok: false, status: "failed", message: `Billing sync failed — ${err instanceof Error ? err.message : String(err)}.` };
  }
  return { factoring, billing };
}

/** Store a failed after-commit run so it can be retried; returns nothing (best effort is NOT allowed — it throws). */
export async function recordAfterCommit(actorUserId: string, input: AfterCommitInput, stages: AfterCommitStages): Promise<void> {
  await withCurrentUser(actorUserId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    await appendCrudAudit(
      client as never,
      actorUserId,
      AFTER_COMMIT_EVENT,
      { settlement_id: input.settlement_id, operating_company_id: input.operating_company_id, ok: stages.factoring.ok && stages.billing.ok, stages, retry: input },
      stages.factoring.ok && stages.billing.ok ? "info" : "warning",
      "ROUND-443.7",
    );
  });
}

/** The last stored after-commit run for a settlement (what a retry re-runs). */
export async function loadLastAfterCommit(actorUserId: string, companyId: string, settlementId: string): Promise<{ ok: boolean; retry: AfterCommitInput } | null> {
  return withCurrentUser(actorUserId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    const r = await client.query<{ payload: { ok: boolean; retry: AfterCommitInput } }>(
      `SELECT payload FROM audit.audit_events
        WHERE event_class = $1 AND payload ->> 'settlement_id' = $2 AND payload ->> 'operating_company_id' = $3
        ORDER BY created_at DESC LIMIT 1`,
      [AFTER_COMMIT_EVENT, settlementId, companyId],
    );
    return r.rows[0]?.payload ?? null;
  });
}

export function overallOk(stages: CreatorStages): boolean {
  return stages.documents.ok && stages.ledger.ok && stages.factoring.ok && stages.billing.ok;
}
