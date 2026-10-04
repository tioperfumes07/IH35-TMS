export default {
  name: "verify:edit-trailer-action-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-edit-trailer-action-company-lifecycle.mjs"]);
  },
};
