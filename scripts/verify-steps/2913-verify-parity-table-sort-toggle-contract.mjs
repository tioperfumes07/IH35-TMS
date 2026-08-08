export default {
  name: "verify:parity-table-sort-toggle-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-parity-table-sort-toggle-contract.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-parity-table-sort-toggle-contract.mjs"]);
  },
};
