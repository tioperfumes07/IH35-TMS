export default {
  name: "verify:complaints-actions-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-complaints-actions-company-lifecycle.mjs"]);
  },
};
