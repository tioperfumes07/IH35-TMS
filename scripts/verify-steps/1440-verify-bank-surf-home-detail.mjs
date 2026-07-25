export default {
  name: "verify-bank-surf-home-detail",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-surf-home-detail.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bank-surf-home-detail.mjs"]);
  },
};
