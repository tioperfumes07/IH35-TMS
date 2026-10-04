export default {
  name: "verify:list-defaults-and-kpi-shape",
  run(ctx) {
    ctx.run("node", ["scripts/verify-list-defaults-and-kpi-shape.mjs"]);
  },
};
