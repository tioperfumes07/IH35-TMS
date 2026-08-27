export default {
  name: "verify:audit-subject-banking-accounting-label",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-subject-banking-accounting-label.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-audit-subject-banking-accounting-label.mjs"]);
  },
};
