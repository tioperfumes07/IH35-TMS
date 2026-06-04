export default {
  name: "verify-dispatch-detention-board",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:dispatch-detention-board"]) !== 0) {
      throw new Error("verify:dispatch-detention-board failed");
    }
  },
};
