export default {
  name: "verify:background-check-create-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-background-check-create-company-lifecycle.mjs"]);
  },
};
