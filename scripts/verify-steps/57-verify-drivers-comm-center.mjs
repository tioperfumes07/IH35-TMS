export default {
  name: "verify-drivers-comm-center",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:drivers-comm-center"]) !== 0) {
      throw new Error("verify-drivers-comm-center failed");
    }
  },
};
