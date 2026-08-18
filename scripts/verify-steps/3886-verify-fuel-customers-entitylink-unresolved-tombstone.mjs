export default {
  name: "verify:fuel-customers-entitylink-unresolved-tombstone",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-customers-entitylink-unresolved-tombstone.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fuel-customers-entitylink-unresolved-tombstone.mjs"]);
  },
};
