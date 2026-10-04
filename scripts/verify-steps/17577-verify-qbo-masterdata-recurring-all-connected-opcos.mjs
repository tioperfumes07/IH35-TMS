export default {
  name: "verify:qbo-masterdata-recurring-all-connected-opcos",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-masterdata-recurring-all-connected-opcos.mjs"]);
  },
};
