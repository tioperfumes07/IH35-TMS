// verify-steps wrapper for scripts/verify-load-cancellations-report.mjs (GAP-10 load cancellations
// analytics report — retargeted 2026-08-21 from a dead/never-built spec to the real, live,
// end-to-end wired implementation, verify-step 4155). Static, no DB — same shape as
// verify-steps/4154-*.mjs and siblings.
export default {
  name: "verify-load-cancellations-report",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-cancellations-report.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-load-cancellations-report.mjs"]);
  },
};
