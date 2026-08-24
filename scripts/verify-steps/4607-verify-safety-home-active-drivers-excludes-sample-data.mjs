export default {
  name: "verify-safety-home-active-drivers-excludes-sample-data",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-safety-home-active-drivers-excludes-sample-data.mjs"]) !== 0) {
      throw new Error("verify-safety-home-active-drivers-excludes-sample-data failed");
    }
  },
};
