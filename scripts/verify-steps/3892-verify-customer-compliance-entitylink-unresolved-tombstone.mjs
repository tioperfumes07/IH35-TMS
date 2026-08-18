export default {
  name: "verify:customer-compliance-entitylink-unresolved-tombstone",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-customer-compliance-entitylink-unresolved-tombstone.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-compliance-entitylink-unresolved-tombstone.mjs"]);
  },
};
