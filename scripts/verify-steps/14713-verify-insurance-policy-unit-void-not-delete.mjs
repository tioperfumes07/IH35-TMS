export default {
  name: "verify:insurance-policy-unit-void-not-delete",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-policy-unit-void-not-delete.mjs"]);
  },
};
