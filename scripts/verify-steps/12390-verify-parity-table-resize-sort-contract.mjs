export default {
  name: "verify:parity-table-resize-sort-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-parity-table-resize-sort-contract.mjs"]);
  },
};
