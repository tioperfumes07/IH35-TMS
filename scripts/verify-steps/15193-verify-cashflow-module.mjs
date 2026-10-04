export default {
  name: "verify:cashflow-module",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cashflow-module.mjs"]);
  },
};
