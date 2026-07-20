export default {
  name: "verify:unbilled-revenue-accounts",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unbilled-revenue-accounts.mjs"]);
  },
};
