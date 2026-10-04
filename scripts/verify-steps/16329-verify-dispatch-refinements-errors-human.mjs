export default {
  name: "verify:dispatch-refinements-errors-human",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-refinements-errors-human.mjs"]);
  },
};
