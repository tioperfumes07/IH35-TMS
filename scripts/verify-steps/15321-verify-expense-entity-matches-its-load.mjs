export default {
  name: "verify:expense-entity-matches-its-load",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-entity-matches-its-load.mjs"]);
  },
};
