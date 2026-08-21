import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { runAuditChainVerifyTick } from "../audit/audit-chain-verify.cron.service.js";

// In-process daily audit hash-chain verifier. Mirrors loves-card-import.cron.ts EXACTLY: node-cron with an
// America/Chicago timezone, wrapped in wrapBackgroundJobTick so every run records _system.background_jobs
// (→ /healthz staleness) — the SAME mechanism the standalone Render entrypoint (run-audit-chain-verify.ts)
// relies on. The tick itself (runAuditChainVerifyTick) records ops.audit_chain_verifications and alarms the
// owner on a chain break / missed run. Read-only against events.event_log — repairs nothing, posts no money,
// flips no flag. ADDITIVE — it only SCHEDULES the already-built tick so the verifier runs without depending
// on a Render cron service.
let initialized = false;
export const AUDIT_CHAIN_VERIFY_JOB = "audit.chain_verify";
const CRON_EXPRESSION = "0 3 * * *"; // 03:00 CT (Render: "0 9 * * *" UTC)
const CRON_TZ = "America/Chicago";

export function initializeAuditChainVerifyCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if ((process.env.AUDIT_CHAIN_VERIFY_CRON_ENABLED ?? "true").trim() === "false") {
    app.log.info("Audit-chain-verify cron disabled via AUDIT_CHAIN_VERIFY_CRON_ENABLED=false");
    return;
  }

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(
        AUDIT_CHAIN_VERIFY_JOB,
        async () => {
          await runAuditChainVerifyTick();
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: CRON_TZ }
  );

  app.log.info("Audit-chain-verify cron scheduled (daily 03:00 America/Chicago)");
}
