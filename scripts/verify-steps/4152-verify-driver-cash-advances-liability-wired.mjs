// verify-steps wrapper for scripts/verify-driver-cash-advances-liability-wired.mjs
// (WAVE 1 drivers money — cash advances liability, verify-step 4152). Static, no DB — same shape as
// verify-steps/4151-*.mjs and siblings.
export default {
  name: "verify-driver-cash-advances-liability-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-cash-advances-liability-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-cash-advances-liability-wired.mjs"]);
  },
};
