export default {
  name: "verify-profit-per-truck-cpm-excludes-sample-data",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-profit-per-truck-cpm-excludes-sample-data.mjs"]) !== 0) {
      throw new Error("verify-profit-per-truck-cpm-excludes-sample-data failed");
    }
  },
};
