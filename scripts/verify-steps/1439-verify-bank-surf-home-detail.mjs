export default {
  name: "verify-bank-surf-home-detail",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-bank-surf-home-detail.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bank-surf-home-detail.mjs"]);
  },
};
