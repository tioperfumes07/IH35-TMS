// verify-steps wrapper for scripts/verify-payable-selector-excludes-void.mjs (ACCT-F5028, step 3222).
export default {
  name: "verify-payable-selector-excludes-void",
  run(ctx) {
    ctx.run("node", ["scripts/verify-payable-selector-excludes-void.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-payable-selector-excludes-void.mjs"]);
  },
};
