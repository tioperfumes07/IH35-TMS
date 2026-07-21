export default {
  name: "verify:escrow-deductions-pending-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-escrow-deductions-pending-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-escrow-deductions-pending-uses-paritytable.mjs"]);
  },
};
