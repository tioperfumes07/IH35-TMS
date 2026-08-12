// verify-steps wrapper for scripts/verify-bills-open-status-spelling-complete.mjs
// (ACCT-F183-class vertical wiring, verify-step 3185). Static, no DB — same shape as
// verify-steps/3177-*.mjs and siblings.
export default {
  name: "verify-bills-open-status-spelling-complete",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bills-open-status-spelling-complete.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bills-open-status-spelling-complete.mjs"]);
  },
};
