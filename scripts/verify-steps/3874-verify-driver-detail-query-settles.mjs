export default {
  name: "verify:driver-detail-query-settles",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-driver-detail-query-settles.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-detail-query-settles.mjs"]);
  },
};
