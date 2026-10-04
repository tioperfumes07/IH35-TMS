export default {
  name: "verify:insurance-claim-create-scope-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-claim-create-scope-lifecycle.mjs"]);
  },
};
