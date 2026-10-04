export default {
  name: "verify:create-trailer-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-create-trailer-company-lifecycle.mjs"]);
  },
};
