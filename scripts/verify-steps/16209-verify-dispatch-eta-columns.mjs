export default {
  name: "verify:dispatch-eta-columns",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-eta-columns.mjs"]);
  },
};
