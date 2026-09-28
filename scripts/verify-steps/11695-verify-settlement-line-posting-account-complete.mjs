export default {
  name: "verify:settlement-line-posting-account-complete",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-line-posting-account-complete.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-settlement-line-posting-account-complete.mjs"]);
  },
};
