export default {
  name: "verify:internal-fines-load-settlement-sortable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-internal-fines-load-settlement-sortable.mjs"]);
  },
};
