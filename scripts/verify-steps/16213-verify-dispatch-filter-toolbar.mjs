export default {
  name: "verify:dispatch-filter-toolbar",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-filter-toolbar.mjs"]);
  },
};
