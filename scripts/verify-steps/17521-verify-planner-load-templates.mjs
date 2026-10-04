export default {
  name: "verify:planner-load-templates",
  run(ctx) {
    ctx.run("node", ["scripts/verify-planner-load-templates.mjs"]);
  },
};
