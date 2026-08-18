export default {
  name: "verify:audit-cashflow-entitylink-unresolved-tombstone",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-audit-cashflow-entitylink-unresolved-tombstone.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-audit-cashflow-entitylink-unresolved-tombstone.mjs"]);
  },
};
