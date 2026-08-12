// verify-steps wrapper for scripts/verify-expense-column-wave.mjs
// (WAVE-C expense column-wave, verify-step 3201). Static, no DB — same shape as
// verify-steps/3197-*.mjs and siblings.
export default {
  name: "verify-expense-column-wave",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-column-wave.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-expense-column-wave.mjs"]);
  },
};
