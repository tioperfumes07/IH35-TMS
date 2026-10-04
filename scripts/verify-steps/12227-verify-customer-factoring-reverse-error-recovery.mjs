export default {
  name: "verify:customer-factoring-reverse-error-recovery",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-factoring-reverse-error-recovery.mjs"]);
  },
};
