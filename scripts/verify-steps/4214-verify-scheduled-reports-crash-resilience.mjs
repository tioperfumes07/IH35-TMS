// verify-steps wrapper for scripts/verify-scheduled-reports-crash-resilience.mjs
// PROD-OUTAGE-SCHEDULED-REPORTS-PUPPETEER-ROOT-CAUSE-CONFIRMED — a stuck reporting.scheduled_reports
// row's PDF generation (Puppeteer) crashed the whole Node process rather than throwing a catchable
// exception, and next_run_at only ever advanced on a JS-catchable outcome — so the poisoned row
// retried on every tick, forever, live production outage this session. Fixed with container-safe
// launch args + a hard generation timeout (report-file-builder.ts) and a pessimistic next_run_at
// backoff set BEFORE the risky call (scheduled-reports-worker.ts). Rule 37 claim-then-author (claim
// shipped in #13694). Static, no DB.
export default {
  name: "verify-scheduled-reports-crash-resilience",
  run(ctx) {
    ctx.run("node", ["scripts/verify-scheduled-reports-crash-resilience.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-scheduled-reports-crash-resilience.mjs"]);
  },
};
