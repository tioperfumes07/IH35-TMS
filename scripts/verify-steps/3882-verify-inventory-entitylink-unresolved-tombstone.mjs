export default {
  name: "verify:inventory-entitylink-unresolved-tombstone",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-inventory-entitylink-unresolved-tombstone.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-inventory-entitylink-unresolved-tombstone.mjs"]);
  },
};
