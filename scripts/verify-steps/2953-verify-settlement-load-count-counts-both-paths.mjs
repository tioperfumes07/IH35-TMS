export default {
  name: "verify:settlement-load-count-counts-both-paths",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-load-count-counts-both-paths.mjs"]);
  },
};
