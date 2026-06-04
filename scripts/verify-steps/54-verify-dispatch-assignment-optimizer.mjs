export default {
  name: "verify-dispatch-assignment-optimizer",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:dispatch-assignment-optimizer"]) !== 0) {
      throw new Error("verify-dispatch-assignment-optimizer failed");
    }
  },
};
