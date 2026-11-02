export default {
  name: "verify:insurance-policy-wizard-complete-fleet-picker",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-policy-wizard-complete-fleet-picker.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-insurance-policy-wizard-complete-fleet-picker.mjs"]);
  },
};
