export default {
  name: "verify-inbox-reporting-excludes-sample-data",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-inbox-reporting-excludes-sample-data.mjs"]) !== 0) {
      throw new Error("verify-inbox-reporting-excludes-sample-data failed");
    }
  },
};
