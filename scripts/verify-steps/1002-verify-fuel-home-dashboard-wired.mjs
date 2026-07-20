export default {
  name: "verify:fuel-home-dashboard-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-home-dashboard-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fuel-home-dashboard-wired.mjs"]);
  },
};
