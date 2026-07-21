export default {
  name: "verify:auto-deductions-subledger",
  run(ctx) {
    ctx.run("node", ["scripts/verify-auto-deductions-subledger.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-auto-deductions-subledger.mjs"]);
  },
};
