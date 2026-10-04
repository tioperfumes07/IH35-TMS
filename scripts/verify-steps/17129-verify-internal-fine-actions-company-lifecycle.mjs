export default {
  name: "verify:internal-fine-actions-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-internal-fine-actions-company-lifecycle.mjs"]);
  },
};
