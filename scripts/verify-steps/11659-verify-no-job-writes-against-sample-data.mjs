export default {
  name: "verify:no-job-writes-against-sample-data",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-job-writes-against-sample-data.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-no-job-writes-against-sample-data.mjs"]);
  },
};
