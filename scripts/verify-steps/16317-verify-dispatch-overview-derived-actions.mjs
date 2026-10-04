export default {
  name: "verify:dispatch-overview-derived-actions",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-overview-derived-actions.mjs"]);
  },
};
