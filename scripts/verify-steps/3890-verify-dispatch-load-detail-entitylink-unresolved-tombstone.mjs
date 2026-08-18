export default {
  name: "verify:dispatch-load-detail-entitylink-unresolved-tombstone",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-load-detail-entitylink-unresolved-tombstone.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispatch-load-detail-entitylink-unresolved-tombstone.mjs"]);
  },
};
