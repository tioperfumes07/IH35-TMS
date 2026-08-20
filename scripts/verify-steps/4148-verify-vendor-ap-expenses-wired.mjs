// verify-steps wrapper for scripts/verify-vendor-ap-expenses-wired.mjs
// (WAVE 2 vendors money — expense column, verify-step 4148). Static, no DB — same shape as
// verify-steps/3201-*.mjs and siblings.
export default {
  name: "verify-vendor-ap-expenses-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-ap-expenses-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendor-ap-expenses-wired.mjs"]);
  },
};
