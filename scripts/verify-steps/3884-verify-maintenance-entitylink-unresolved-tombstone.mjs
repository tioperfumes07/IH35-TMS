export default {
  name: "verify:maintenance-entitylink-unresolved-tombstone",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-entitylink-unresolved-tombstone.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-maintenance-entitylink-unresolved-tombstone.mjs"]);
  },
};
