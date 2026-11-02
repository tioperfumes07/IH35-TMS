export default {
  name: "verify:referenced-tables-exist",
  run(ctx) {
    ctx.run("node", ["scripts/verify-referenced-tables-exist.mjs"]);
  },
};
