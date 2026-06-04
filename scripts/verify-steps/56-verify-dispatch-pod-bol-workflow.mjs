export default {
  name: "verify-dispatch-pod-bol-workflow",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:dispatch-pod-bol-workflow"]) !== 0) {
      throw new Error("verify-dispatch-pod-bol-workflow failed");
    }
  },
};
