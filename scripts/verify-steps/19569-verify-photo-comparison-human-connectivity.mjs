export default {
  name: "verify:photo-comparison-human-connectivity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-photo-comparison-human-connectivity.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-photo-comparison-human-connectivity.mjs"]);
  },
};
