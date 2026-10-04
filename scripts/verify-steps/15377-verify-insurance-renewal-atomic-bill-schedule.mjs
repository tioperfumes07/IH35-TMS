export default {
  name: "verify:insurance-renewal-atomic-bill-schedule",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-renewal-atomic-bill-schedule.mjs"]);
  },
};
