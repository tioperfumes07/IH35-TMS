export default {
  name: "verify:vendor-bill-user-dispatch-uuid-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-bill-user-dispatch-uuid-human-labels.mjs"]);
  },
};
