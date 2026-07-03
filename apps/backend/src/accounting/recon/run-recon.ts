// RECON-01 cron entrypoint. Invoked by the two Render cron entries:
//   node dist/accounting/recon/run-recon.js am   (06:00 CT bank-count)
//   node dist/accounting/recon/run-recon.js pm   (19:00 CT categorization-diff)
// Read-only; a no-op for any entity whose TMS_QBO_RECON_ENABLED flag is OFF (default).
import { runReconTick } from "./recon-cron.service.js";

async function main() {
  const arg = process.argv[2];
  if (arg !== "am" && arg !== "pm") {
    console.error(`[recon-cron] usage: run-recon <am|pm> — got ${JSON.stringify(arg)}`);
    process.exitCode = 1;
    return;
  }
  const result = await runReconTick(arg);
  console.log("[recon-cron]", JSON.stringify(result));
}

main().catch((error) => {
  console.error("[recon-cron] failed", error);
  process.exitCode = 1;
});
