export default {
  name: "verify:no-null-account-number-active",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-null-account-number-active.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-no-null-account-number-active.mjs"]);
  },
};
