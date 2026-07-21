export default {
  name: "verify:reimbursements-section-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reimbursements-section-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-reimbursements-section-uses-paritytable.mjs"]);
  },
};
