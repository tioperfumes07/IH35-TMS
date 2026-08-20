export default {
  name: "verify:wo-detail-entitylink-id-cast",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wo-detail-entitylink-id-cast.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-wo-detail-entitylink-id-cast.mjs"]);
  },
};
