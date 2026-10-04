export default {
  name: "verify:driver-onboarding-action-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-onboarding-action-company-lifecycle.mjs"]);
  },
};
