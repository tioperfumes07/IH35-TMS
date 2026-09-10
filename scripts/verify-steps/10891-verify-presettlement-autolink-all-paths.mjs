export default {
  name: "verify:presettlement-autolink-all-paths",
  run(ctx) {
    ctx.run("node", ["scripts/verify-presettlement-autolink-all-paths.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-presettlement-autolink-all-paths.mjs"]);
  },
};
