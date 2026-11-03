export default {
  name: "verify:fuel-follows-truck-engine-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-follows-truck-engine-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fuel-follows-truck-engine-wired.mjs"]);
  },
};
