export default {
  name: "verify:external-fine-convert-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-external-fine-convert-company-lifecycle.mjs"]);
  },
};
