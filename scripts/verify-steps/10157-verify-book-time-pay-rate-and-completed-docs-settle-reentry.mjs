// ACCT-F10159 (DEFECT A) + ACCT-F10160 (DEFECT B), GO-IDLE-WAKE-2026-08-31T1715Z. Step 10157 · CC-1 lane.
export default {
  name: "book-time-pay-rate-and-completed-docs-settle-reentry",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-time-pay-rate-and-completed-docs-settle-reentry.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-book-time-pay-rate-and-completed-docs-settle-reentry.mjs"]);
  },
};
