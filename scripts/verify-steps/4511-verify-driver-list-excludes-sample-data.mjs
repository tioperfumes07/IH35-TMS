export default {
  name: "verify-driver-list-excludes-sample-data",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-driver-list-excludes-sample-data.mjs"]) !== 0) {
      throw new Error("verify-driver-list-excludes-sample-data failed");
    }
  },
};
