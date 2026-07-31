export default {
  name: "verify:disp-filter-01-mdata-status-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-disp-filter-01-mdata-status-contract.mjs"]);
  },
};
