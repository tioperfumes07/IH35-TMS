export default {
  name: "verify:safety-entitylink-unresolved-tombstone",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-safety-entitylink-unresolved-tombstone.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-entitylink-unresolved-tombstone.mjs"]);
  },
};
