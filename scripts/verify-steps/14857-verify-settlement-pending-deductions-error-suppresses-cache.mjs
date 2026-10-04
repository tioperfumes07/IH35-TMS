export default {
  name: "verify:settlement-pending-deductions-error-suppresses-cache",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-pending-deductions-error-suppresses-cache.mjs"]);
  },
};
