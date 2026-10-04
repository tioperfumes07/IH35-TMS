export default {
  name: "verify:no-phantom-entity-columns",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-phantom-entity-columns.mjs"]);
  },
};
