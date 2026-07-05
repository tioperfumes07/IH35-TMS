// G10-C1 cron entrypoint. Invoked by the Render cron entry:
//   node dist/audit/run-audit-chain-verify.js   (daily 03:00 CT)
// Runs the tamper-evident hash-chain verifier (verifyEventChain) for every active operating company,
// records each result to ops.audit_chain_verifications, and alarms the owner on a chain break or a missed
// run. Read-only against events.event_log — repairs nothing, posts no money, flips no flag. Mirrors the
// accounting/recon/run-recon.ts entrypoint shape.
import { runAuditChainVerifyTick } from "./audit-chain-verify.cron.service.js";

async function main() {
  const result = await runAuditChainVerifyTick();
  console.log("[audit-chain-verify]", JSON.stringify(result));
}

main().catch((error) => {
  console.error("[audit-chain-verify] failed", error);
  process.exitCode = 1;
});
