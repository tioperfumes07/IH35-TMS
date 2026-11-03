export default {
  name: "verify:double-entry-balance-trigger",
  run(ctx) {
    ctx.run("node", ["scripts/verify-double-entry-balance-trigger.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-double-entry-balance-trigger.mjs"]);
  },
};
