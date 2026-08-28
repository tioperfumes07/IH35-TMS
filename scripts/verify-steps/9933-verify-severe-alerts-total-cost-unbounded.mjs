export default {
  name: "verify:severe-alerts-total-cost-unbounded",
  run(ctx) {
    ctx.run("node", ["scripts/verify-severe-alerts-total-cost-unbounded.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-severe-alerts-total-cost-unbounded.mjs"]);
  },
};
