export default {
  name: "verify:dispatch-vehicle-entitylink-unresolved-tombstone",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-vehicle-entitylink-unresolved-tombstone.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispatch-vehicle-entitylink-unresolved-tombstone.mjs"]);
  },
};
