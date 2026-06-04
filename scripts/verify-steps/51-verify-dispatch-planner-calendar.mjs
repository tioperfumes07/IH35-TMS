export default {
  name: "verify-dispatch-planner-calendar",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:dispatch-planner-calendar"]) !== 0) {
      throw new Error("verify:dispatch-planner-calendar failed");
    }
  },
};
