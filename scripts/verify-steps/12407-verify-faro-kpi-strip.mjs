export default {
  name: "verify:faro-kpi-strip",
  run(ctx) {
    ctx.run("node", ["scripts/verify-faro-kpi-strip.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-faro-kpi-strip.mjs"]);
  },
};
