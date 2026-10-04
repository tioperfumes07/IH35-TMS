export default {
  name: "verify:period-money-control-flag-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-period-money-control-flag-gate.mjs"]);
  },
};
