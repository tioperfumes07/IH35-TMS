export default {
  name: "verify:company-settlement-period-grain",
  run(ctx) {
    ctx.run("node", ["scripts/verify-company-settlement-period-grain.mjs"]);
  },
};
