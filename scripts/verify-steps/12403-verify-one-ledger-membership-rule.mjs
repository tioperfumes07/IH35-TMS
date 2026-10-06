export default {
  name: "verify:one-ledger-membership-rule",
  run(ctx) {
    ctx.run("node", ["scripts/verify-one-ledger-membership-rule.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-one-ledger-membership-rule.mjs"]);
  },
};
