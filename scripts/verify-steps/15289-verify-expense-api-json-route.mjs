export default {
  name: "verify:expense-api-json-route",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-api-json-route.mjs"]);
  },
};
