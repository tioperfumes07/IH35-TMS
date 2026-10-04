export default {
  name: "verify:drug-alcohol-dashboard-draw-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drug-alcohol-dashboard-draw-company-lifecycle.mjs"]);
  },
};
