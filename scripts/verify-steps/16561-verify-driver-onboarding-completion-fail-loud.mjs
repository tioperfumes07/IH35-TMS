export default {
  name: "verify:driver-onboarding-completion-fail-loud",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-onboarding-completion-fail-loud.mjs"]);
  },
};
