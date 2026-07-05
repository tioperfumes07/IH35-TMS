// FINDING H5-3 — DR-drill evidence retrievability check entrypoint.
//   node dist/cron/run-dr-drill-evidence-check.js   (invoked by scripts/backup-restore-drill.sh)
// Lists/HEADs a sample of evidence objects the DB claims to hold in R2 and prints a structured report.
// READ-ONLY — repairs nothing, posts no money, flips no flag, raises no alarm (a drill reports).
// Exit code: 0 = all sampled objects present (or nothing to sample / R2 not configured → skip);
//            2 = one or more evidence objects MISSING (backup/restore integrity gap).
import { runDrDrillEvidenceCheck } from "./evidence-presence-reconcile.cron.js";

async function main() {
  const report = await runDrDrillEvidenceCheck();
  console.log("[dr-drill-evidence]", JSON.stringify(report));
  if (report.skippedReason) {
    console.log(`[dr-drill-evidence] SKIP — ${report.skippedReason}`);
    return;
  }
  if (report.missing > 0) {
    console.error(`[dr-drill-evidence] FAIL — ${report.missing} evidence object(s) MISSING in ${report.bucket}`);
    process.exitCode = 2;
    return;
  }
  console.log(
    `[dr-drill-evidence] PASS — ${report.present}/${report.sampled} present` +
      (report.errored ? ` (${report.errored} inconclusive)` : ""),
  );
}

main().catch((error) => {
  console.error("[dr-drill-evidence] runner failed", error);
  process.exitCode = 1;
});
