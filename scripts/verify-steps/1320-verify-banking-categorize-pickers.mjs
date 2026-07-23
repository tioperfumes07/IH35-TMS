export default {
  name: "banking-categorize-pickers",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-banking-categorize-pickers.mjs"]);
  },
};
