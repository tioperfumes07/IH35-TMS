// verify-steps wrapper for scripts/verify-fleet-unit-trailer-expenses-reverse-wired.mjs
// (WAVE 2 fleet money — expense column, verify-step 4149). Static, no DB — same shape as
// verify-steps/4148-*.mjs and siblings.
export default {
  name: "verify-fleet-unit-trailer-expenses-reverse-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fleet-unit-trailer-expenses-reverse-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fleet-unit-trailer-expenses-reverse-wired.mjs"]);
  },
};
