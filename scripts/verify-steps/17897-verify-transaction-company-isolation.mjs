export default {
  name: "verify:transaction-company-isolation",
  run(ctx) {
    ctx.run("node", ["scripts/verify-transaction-company-isolation.mjs"]);
  },
};
