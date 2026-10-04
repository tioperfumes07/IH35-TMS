export default {
  name: "verify:insurance-payment-schedule-mark-paid-scope-snapshot",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-payment-schedule-mark-paid-scope-snapshot.mjs"]);
  },
};
