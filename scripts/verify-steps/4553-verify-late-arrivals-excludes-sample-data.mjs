export default {
  name: "verify:late-arrivals-excludes-sample-data",
  run(ctx) {
    ctx.run("node", ["scripts/verify-late-arrivals-excludes-sample-data.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-late-arrivals-excludes-sample-data.mjs"]);
  },
};
