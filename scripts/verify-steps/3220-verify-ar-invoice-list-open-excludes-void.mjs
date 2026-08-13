// verify-steps wrapper for scripts/verify-ar-invoice-list-open-excludes-void.mjs (ACCT-F5027, step 3220).
export default {
  name: "verify-ar-invoice-list-open-excludes-void",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ar-invoice-list-open-excludes-void.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ar-invoice-list-open-excludes-void.mjs"]);
  },
};
