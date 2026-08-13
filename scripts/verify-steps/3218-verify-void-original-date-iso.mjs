// verify-steps wrapper for scripts/verify-void-original-date-iso.mjs (ACCT-F5026, step 3218).
export default {
  name: "verify-void-original-date-iso",
  run(ctx) {
    ctx.run("node", ["scripts/verify-void-original-date-iso.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-void-original-date-iso.mjs"]);
  },
};
