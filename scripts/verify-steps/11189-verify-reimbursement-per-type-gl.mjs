export default {
  name: "verify:reimbursement-per-type-gl",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reimbursement-per-type-gl.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-reimbursement-per-type-gl.mjs"]);
  },
};
