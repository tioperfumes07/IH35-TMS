export default {
  name: "verify:money-lines-same-entity-fks",
  run(ctx) {
    ctx.run("node", ["scripts/verify-money-lines-same-entity-fks.mjs"]);
  },
};
