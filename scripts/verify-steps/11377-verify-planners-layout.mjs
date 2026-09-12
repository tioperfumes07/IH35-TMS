export default {
  name: "verify-planners-layout",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-planners-layout.mjs"]) !== 0) {
      throw new Error("verify-planners-layout failed");
    }
  },
};
